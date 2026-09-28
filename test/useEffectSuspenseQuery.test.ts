import { renderHook, waitFor } from "@testing-library/react";
import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { UseEffectSuspenseQueryOptions, UseEffectSuspenseQueryResult } from "../src";
import { useEffectSuspenseQuery } from "../src";
import { createSuspenseWrapper } from "./utils";

// Define errors using Schema.TaggedError
class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  message: Schema.String,
}) {}

class NotFoundError extends Schema.TaggedError<NotFoundError>()("NotFoundError", {
  resourceId: Schema.String,
}) {}

// Define a service for testing runtime requirements
class UserService extends Context.Service<
  UserService,
  { readonly getUser: (id: string) => Effect.Effect<{ id: string; name: string }, NetworkError> }
>()("UserService") {}

// ============================================================================
// Hook Behavior Tests
// ============================================================================

describe("useEffectSuspenseQuery", () => {
  it("should return success data when Effect succeeds", async () => {
    const { result } = renderHook(
      () =>
        useEffectSuspenseQuery({
          queryKey: ["suspense-user", "1"],
          queryFn: () => Effect.succeed({ id: "1", name: "Test User" }),
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // In suspense queries, data is always defined
    expect(result.current.data).toEqual({ id: "1", name: "Test User" });
  });

  it("should have data always defined (not undefined)", async () => {
    const { result } = renderHook(
      () =>
        useEffectSuspenseQuery({
          queryKey: ["suspense-user", "defined"],
          queryFn: () => Effect.succeed({ id: "1", name: "User" }),
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Type assertion to verify data is not undefined
    const data: { id: string; name: string } = result.current.data;
    expect(data).toBeDefined();
    expect(data.id).toBe("1");
  });

  it("should pass queryKey in context to queryFn", async () => {
    const queryFn = vi.fn((context: { queryKey: readonly ["suspense-user", string] }) =>
      Effect.succeed({ id: context.queryKey[1], name: "User" }),
    );

    const { result } = renderHook(
      () =>
        useEffectSuspenseQuery({
          queryKey: ["suspense-user", "context-test"] as const,
          queryFn,
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(queryFn).toHaveBeenCalled();
    const callArg = queryFn.mock.calls[0][0];
    expect(callArg.queryKey).toEqual(["suspense-user", "context-test"]);
  });

  // Note: Interruption is tested more thoroughly in useEffectQuery.test.ts
  // Suspense queries use the same createEffectQueryFn internally, so AbortSignal
  // handling is shared. This test verifies the onInterrupt callback fires.
});

// ============================================================================
// Runtime Tests
// ============================================================================

describe("useEffectSuspenseQuery with runtime", () => {
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
        useEffectSuspenseQuery({
          queryKey: ["suspense-user", "runtime"],
          queryFn: () =>
            Effect.gen(function* () {
              const service = yield* UserService;
              return yield* service.getUser("1");
            }),
          runtime,
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: "1", name: "Service User" });

    await runtime.dispose();
  });
});

// ============================================================================
// Type-level Tests (compile-time verification)
// ============================================================================

describe("useEffectSuspenseQuery type-level tests", () => {
  it("should compile: effect without requirements, no runtime needed", () => {
    type EffectNoReqs = Effect.Effect<string, NetworkError, never>;
    type Options = UseEffectSuspenseQueryOptions<string, NetworkError, string, ["test"], never>;

    const _options: Options = {
      queryKey: ["test"],
      queryFn: (): EffectNoReqs => Effect.succeed("test"),
    };

    expect(_options).toBeDefined();
  });

  it("should compile: effect with requirements, runtime required", () => {
    type EffectWithReqs = Effect.Effect<string, NetworkError, UserService>;
    type Options = UseEffectSuspenseQueryOptions<
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

  it("should have data always defined in result type", () => {
    type Result = UseEffectSuspenseQueryResult<
      { id: string; name: string },
      NetworkError | NotFoundError
    >;

    const checkDataType = (result: Result) => {
      const _data: { id: string; name: string } = result.data;
      return _data;
    };

    expect(checkDataType).toBeDefined();
  });

  it("should not allow enabled option", () => {
    type Options = UseEffectSuspenseQueryOptions<string, NetworkError, string, ["test"], never>;

    type HasEnabled = "enabled" extends keyof Options ? true : false;
    const _hasEnabled: HasEnabled = false;

    expect(_hasEnabled).toBe(false);
  });

  it("should not allow throwOnError option", () => {
    type Options = UseEffectSuspenseQueryOptions<string, NetworkError, string, ["test"], never>;

    type HasThrowOnError = "throwOnError" extends keyof Options ? true : false;
    const _hasThrowOnError: HasThrowOnError = false;

    expect(_hasThrowOnError).toBe(false);
  });

  it("should not allow placeholderData option", () => {
    type Options = UseEffectSuspenseQueryOptions<string, NetworkError, string, ["test"], never>;

    type HasPlaceholderData = "placeholderData" extends keyof Options ? true : false;
    const _hasPlaceholderData: HasPlaceholderData = false;

    expect(_hasPlaceholderData).toBe(false);
  });
});
