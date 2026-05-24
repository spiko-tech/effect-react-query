import { renderHook, waitFor } from "@testing-library/react";
import { Context, Effect, Layer, ManagedRuntime, Match, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import type {
  DefinedInitialDataEffectQueryOptions,
  DefinedUseEffectQueryResult,
  UndefinedInitialDataEffectQueryOptions,
  UseEffectQueryOptions,
  UseEffectQueryResult,
} from "../src";
import { skipToken, useEffectQuery } from "../src";
import { createWrapper } from "./utils";

// Define errors using Schema.TaggedError
class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  message: Schema.String,
}) {}

class NotFoundError extends Schema.TaggedError<NotFoundError>()("NotFoundError", {
  resourceId: Schema.String,
}) {}

// Define a service for testing runtime requirements
class UserService extends Context.Tag("UserService")<
  UserService,
  { readonly getUser: (id: string) => Effect.Effect<{ id: string; name: string }, NetworkError> }
>() {}

// ============================================================================
// Hook Behavior Tests
// ============================================================================

describe("useEffectQuery", () => {
  it("should return success data when Effect succeeds", async () => {
    const { result } = renderHook(
      () =>
        useEffectQuery({
          queryKey: ["user", "1"],
          queryFn: () => Effect.succeed({ id: "1", name: "Test User" }),
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: "1", name: "Test User" });
  });

  it("should set error when Effect fails", async () => {
    const { result } = renderHook(
      () =>
        useEffectQuery({
          queryKey: ["user", "fail"],
          queryFn: () => Effect.fail(new NetworkError({ message: "Connection failed" })),
          retry: false,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // The error should be the typed error, not a Cause wrapper
    expect(result.current.error).toBeInstanceOf(NetworkError);
    expect(result.current.error?._tag).toBe("NetworkError");
    expect((result.current.error as NetworkError)?.message).toBe("Connection failed");
  });

  it("should work with Match.valueTags for error discrimination", async () => {
    const { result } = renderHook(
      () =>
        useEffectQuery({
          queryKey: ["user", "error-match"],
          queryFn: () => Effect.fail(new NetworkError({ message: "Timeout" })),
          retry: false,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // This is the key test - error should be usable with Match.valueTags
    const matchResult = Match.valueTags(result.current.error!, {
      NetworkError: (e) => `Network: ${e.message}`,
    });

    expect(matchResult).toBe("Network: Timeout");
  });

  it("should handle multiple error types with Match.valueTags", async () => {
    type QueryError = NetworkError | NotFoundError;

    const { result } = renderHook(
      () =>
        useEffectQuery<{ id: string }, QueryError, { id: string }, ["resource", string]>({
          queryKey: ["resource", "missing"],
          queryFn: () => Effect.fail(new NotFoundError({ resourceId: "missing" })),
          retry: false,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const matchResult = Match.valueTags(result.current.error!, {
      NetworkError: (e) => `Network: ${e.message}`,
      NotFoundError: (e) => `NotFound: ${e.resourceId}`,
    });

    expect(matchResult).toBe("NotFound: missing");
  });

  it("should handle Effect.die (defects) correctly", async () => {
    const defect = new Error("Unexpected crash");

    const { result } = renderHook(
      () =>
        useEffectQuery({
          queryKey: ["user", "defect"],
          queryFn: () => Effect.die(defect),
          retry: false,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Defects should be thrown as-is
    expect(result.current.error).toBe(defect);
  });

  it("should pass queryKey in context to queryFn", async () => {
    const queryFn = vi.fn((context: { queryKey: readonly ["user", string] }) =>
      Effect.succeed({ id: context.queryKey[1], name: "User" }),
    );

    const { result } = renderHook(
      () =>
        useEffectQuery({
          queryKey: ["user", "123"] as const,
          queryFn,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(queryFn).toHaveBeenCalled();
    const callArg = queryFn.mock.calls[0][0];
    expect(callArg.queryKey).toEqual(["user", "123"]);
  });

  it("should handle interruption via AbortSignal (query cancellation)", async () => {
    let wasInterrupted = false;
    let effectStarted = false;

    const { result, unmount } = renderHook(
      () =>
        useEffectQuery({
          queryKey: ["user", "interrupted"],
          queryFn: () =>
            Effect.gen(function* () {
              effectStarted = true;
              // Simulate a long-running operation
              yield* Effect.sleep("10 seconds");
              return { id: "1", name: "User" };
            }).pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  wasInterrupted = true;
                }),
              ),
            ),
        }),
      { wrapper: createWrapper() },
    );

    // Wait for the effect to start
    await waitFor(() => {
      expect(effectStarted).toBe(true);
    });

    // Unmounting should trigger abort signal and interrupt the effect
    unmount();

    // Wait a bit for the interruption to propagate
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(wasInterrupted).toBe(true);
  });
});

// ============================================================================
// Initial Data Tests
// ============================================================================

describe("useEffectQuery with initial data", () => {
  it("should have defined data immediately with initialData", async () => {
    const { result } = renderHook(
      () =>
        useEffectQuery({
          queryKey: ["user", "initial"],
          queryFn: () => Effect.succeed({ id: "1", name: "Fetched User" }),
          initialData: { id: "0", name: "Initial User" },
        }),
      { wrapper: createWrapper() },
    );

    // Data should be immediately available
    expect(result.current.data).toEqual({ id: "0", name: "Initial User" });

    // After fetch completes, data should update
    await waitFor(() => {
      expect(result.current.data).toEqual({ id: "1", name: "Fetched User" });
    });
  });
});

// ============================================================================
// Runtime Tests
// ============================================================================

describe("useEffectQuery with runtime", () => {
  it("should work with ManagedRuntime", async () => {
    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        getUser: (id) => Effect.succeed({ id, name: "Service User" }),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);

    const { result } = renderHook(
      () =>
        useEffectQuery({
          queryKey: ["user", "runtime"],
          queryFn: () =>
            Effect.gen(function* () {
              const service = yield* UserService;
              return yield* service.getUser("1");
            }),
          runtime,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: "1", name: "Service User" });

    await runtime.dispose();
  });

  it("should handle errors from runtime services", async () => {
    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        getUser: () => Effect.fail(new NetworkError({ message: "Service unavailable" })),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);

    const { result } = renderHook(
      () =>
        useEffectQuery({
          queryKey: ["user", "runtime-error"],
          queryFn: () =>
            Effect.gen(function* () {
              const service = yield* UserService;
              return yield* service.getUser("1");
            }),
          runtime,
          retry: false,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(NetworkError);
    expect((result.current.error as NetworkError).message).toBe("Service unavailable");

    await runtime.dispose();
  });
});

// ============================================================================
// Type-level Tests (compile-time verification)
// ============================================================================

describe("useEffectQuery type-level tests", () => {
  it("should compile: effect without requirements, no runtime needed", () => {
    type EffectNoReqs = Effect.Effect<string, NetworkError, never>;
    type Options = UseEffectQueryOptions<string, NetworkError, string, ["test"], never>;

    const _options: Options = {
      queryKey: ["test"],
      queryFn: (): EffectNoReqs => Effect.succeed("test"),
    };

    expect(_options).toBeDefined();
  });

  it("should compile: effect with requirements, runtime required", () => {
    type EffectWithReqs = Effect.Effect<string, NetworkError, UserService>;
    type Options = UseEffectQueryOptions<
      string,
      NetworkError,
      string,
      ["user", string],
      UserService
    >;

    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        getUser: () => Effect.succeed({ id: "1", name: "Test" }),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);

    const _options: Options = {
      queryKey: ["user", "123"],
      queryFn: (): EffectWithReqs =>
        Effect.gen(function* () {
          const service = yield* UserService;
          const user = yield* service.getUser("1");
          return user.name;
        }),
      runtime: runtime,
    };

    expect(_options).toBeDefined();
  });

  it("should compile: defined initial data options", () => {
    type Options = DefinedInitialDataEffectQueryOptions<
      { id: string; name: string },
      NetworkError,
      { id: string; name: string },
      ["user", string],
      never
    >;

    const _options: Options = {
      queryKey: ["user", "123"],
      queryFn: () => Effect.succeed({ id: "123", name: "Test User" }),
      initialData: { id: "initial", name: "Initial User" },
    };

    expect(_options).toBeDefined();
    expect(_options.initialData).toBeDefined();
  });

  it("should compile: undefined initial data options", () => {
    type Options = UndefinedInitialDataEffectQueryOptions<
      { id: string; name: string },
      NetworkError,
      { id: string; name: string },
      ["user", string],
      never
    >;

    const _options: Options = {
      queryKey: ["user", "123"],
      queryFn: () => Effect.succeed({ id: "123", name: "Test User" }),
    };

    expect(_options).toBeDefined();
  });

  it("should have correct result types for defined initial data", () => {
    type Result = DefinedUseEffectQueryResult<{ id: string; name: string }, NetworkError>;

    const checkDataType = (_result: Result) => {
      // In a real scenario with defined initial data, data would be non-null
    };

    expect(checkDataType).toBeDefined();
  });

  it("should have correct result types for undefined initial data", () => {
    type Result = UseEffectQueryResult<{ id: string; name: string }, NetworkError>;

    const checkDataType = (_result: Result) => {
      // data could be undefined when query hasn't loaded yet
    };

    expect(checkDataType).toBeDefined();
  });
});

// ============================================================================
// skipToken Tests
// ============================================================================

describe("useEffectQuery with skipToken", () => {
  it("should skip the query when skipToken is passed", async () => {
    const { result } = renderHook(
      () =>
        useEffectQuery({
          queryKey: ["user", "skipped"],
          queryFn: skipToken,
        }),
      { wrapper: createWrapper() },
    );

    // Query should be in pending state (not loading, not fetched)
    expect(result.current.isPending).toBe(true);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("should conditionally skip based on truthy/falsy value", async () => {
    const userId: string | null = null;

    const { result } = renderHook(
      () =>
        useEffectQuery({
          queryKey: ["user", userId],
          queryFn: userId ? () => Effect.succeed({ id: userId, name: "User" }) : skipToken,
        }),
      { wrapper: createWrapper() },
    );

    // Query should be skipped
    expect(result.current.isPending).toBe(true);
    expect(result.current.isFetching).toBe(false);
  });

  it("should execute query when condition becomes truthy", async () => {
    const { result, rerender } = renderHook(
      ({ userId }: { userId: string | null }) =>
        useEffectQuery({
          queryKey: ["user", userId],
          queryFn: userId ? () => Effect.succeed({ id: userId, name: "User" }) : skipToken,
        }),
      {
        wrapper: createWrapper(),
        initialProps: { userId: null as string | null },
      },
    );

    // Initially skipped
    expect(result.current.isPending).toBe(true);
    expect(result.current.isFetching).toBe(false);

    // Re-render with a valid userId
    rerender({ userId: "123" });

    // Now it should fetch
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: "123", name: "User" });
  });

  it("should compile: skipToken without runtime option", () => {
    // This is a type-level test - when queryFn is skipToken, runtime should not be required
    type Options = UseEffectQueryOptions<
      { id: string; name: string },
      NetworkError,
      { id: string; name: string },
      ["user", string],
      UserService // Has requirements, but skipToken should not require runtime
    >;

    const _options: Options = {
      queryKey: ["user", "123"],
      queryFn: skipToken,
      // runtime is NOT required when using skipToken
    };

    expect(_options).toBeDefined();
    expect(_options.queryFn).toBe(skipToken);
  });

  it("should not allow runtime with skipToken (type-level test)", () => {
    // This test verifies the type constraint - runtime?: never when using skipToken
    // The following would cause a TypeScript error:
    // const _invalid: UseEffectQueryOptions<string, Error, string, ["test"], UserService> = {
    //   queryKey: ["test"],
    //   queryFn: skipToken,
    //   runtime: someRuntime, // Error: Type 'Runtime<UserService>' is not assignable to type 'undefined'
    // };

    // We can only test that skipToken without runtime compiles
    const _valid: UseEffectQueryOptions<string, Error, string, ["test"], UserService> = {
      queryKey: ["test"],
      queryFn: skipToken,
    };

    expect(_valid).toBeDefined();
  });
});
