import { renderHook, waitFor } from "@testing-library/react";
import { Context, Effect, Layer, ManagedRuntime, Match, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { UseEffectQueryOptionsForUseQueries } from "../src";
import { skipToken, useEffectQueries } from "../src";
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

describe("useEffectQueries", () => {
  it("should return success data when all Effects succeed", async () => {
    const { result } = renderHook(
      () =>
        useEffectQueries({
          queries: [
            {
              queryKey: ["user", "1"],
              queryFn: () => Effect.succeed({ id: "1", name: "Alice" }),
            },
            {
              queryKey: ["user", "2"],
              queryFn: () => Effect.succeed({ id: "2", name: "Bob" }),
            },
          ],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[1].isSuccess).toBe(true);
    });

    expect(result.current[0].data).toEqual({ id: "1", name: "Alice" });
    expect(result.current[1].data).toEqual({ id: "2", name: "Bob" });
  });

  it("should handle mixed success and error results", async () => {
    const { result } = renderHook(
      () =>
        useEffectQueries({
          queries: [
            {
              queryKey: ["user", "success"],
              queryFn: () => Effect.succeed({ id: "1", name: "Alice" }),
            },
            {
              queryKey: ["user", "error"],
              queryFn: () => Effect.fail(new NetworkError({ message: "Connection failed" })),
              retry: false,
            },
          ],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[1].isError).toBe(true);
    });

    expect(result.current[0].data).toEqual({ id: "1", name: "Alice" });
    expect(result.current[1].error).toBeInstanceOf(NetworkError);
    expect((result.current[1].error as NetworkError)?.message).toBe("Connection failed");
  });

  it("should work with Match.valueTags for error discrimination", async () => {
    const { result } = renderHook(
      () =>
        useEffectQueries({
          queries: [
            {
              queryKey: ["resource", "missing"],
              queryFn: () => Effect.fail(new NotFoundError({ resourceId: "123" })),
              retry: false,
            },
          ],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isError).toBe(true);
    });

    const matchResult = Match.valueTags(result.current[0].error!, {
      NotFoundError: (e) => `NotFound: ${e.resourceId}`,
    });

    expect(matchResult).toBe("NotFound: 123");
  });

  it("should pass queryKey in context to queryFn", async () => {
    const queryFn1 = vi.fn((context: { queryKey: readonly ["user", string] }) =>
      Effect.succeed({ id: context.queryKey[1], name: "User 1" }),
    );
    const queryFn2 = vi.fn((context: { queryKey: readonly ["user", string] }) =>
      Effect.succeed({ id: context.queryKey[1], name: "User 2" }),
    );

    const { result } = renderHook(
      () =>
        useEffectQueries({
          queries: [
            {
              queryKey: ["user", "123"] as const,
              queryFn: queryFn1,
            },
            {
              queryKey: ["user", "456"] as const,
              queryFn: queryFn2,
            },
          ],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[1].isSuccess).toBe(true);
    });

    expect(queryFn1).toHaveBeenCalled();
    expect(queryFn2).toHaveBeenCalled();
    expect(queryFn1.mock.calls[0][0].queryKey).toEqual(["user", "123"]);
    expect(queryFn2.mock.calls[0][0].queryKey).toEqual(["user", "456"]);
  });

  it("should handle interruption via AbortSignal (query cancellation)", async () => {
    let wasInterrupted = false;
    let effectStarted = false;

    const { result, unmount } = renderHook(
      () =>
        useEffectQueries({
          queries: [
            {
              queryKey: ["user", "interrupted"],
              queryFn: () =>
                Effect.gen(function* () {
                  effectStarted = true;
                  yield* Effect.sleep("10 seconds");
                  return { id: "1", name: "User" };
                }).pipe(
                  Effect.onInterrupt(() =>
                    Effect.sync(() => {
                      wasInterrupted = true;
                    }),
                  ),
                ),
            },
          ],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(effectStarted).toBe(true);
    });

    unmount();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(wasInterrupted).toBe(true);
  });
});

// ============================================================================
// Combine Function Tests
// ============================================================================

describe("useEffectQueries with combine", () => {
  it("should support combine function to transform results", async () => {
    const { result } = renderHook(
      () =>
        useEffectQueries({
          queries: [
            {
              queryKey: ["user", "1"],
              queryFn: () => Effect.succeed({ id: "1", name: "Alice" }),
            },
            {
              queryKey: ["user", "2"],
              queryFn: () => Effect.succeed({ id: "2", name: "Bob" }),
            },
          ],
          combine: (results) => ({
            users: results.map((r) => r.data).filter(Boolean),
            isAnyLoading: results.some((r) => r.isLoading),
            isAllSuccess: results.every((r) => r.isSuccess),
          }),
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isAllSuccess).toBe(true);
    });

    expect(result.current.users).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);
    expect(result.current.isAnyLoading).toBe(false);
  });
});

// ============================================================================
// Runtime Tests
// ============================================================================

describe("useEffectQueries with runtime", () => {
  it("should work with ManagedRuntime for individual queries", async () => {
    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        getUser: (id) => Effect.succeed({ id, name: `Service User ${id}` }),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);

    const { result } = renderHook(
      () =>
        useEffectQueries({
          queries: [
            {
              queryKey: ["user", "1"],
              queryFn: () =>
                Effect.gen(function* () {
                  const service = yield* UserService;
                  return yield* service.getUser("1");
                }),
              runtime,
            },
            {
              queryKey: ["user", "2"],
              queryFn: () =>
                Effect.gen(function* () {
                  const service = yield* UserService;
                  return yield* service.getUser("2");
                }),
              runtime,
            },
          ],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[1].isSuccess).toBe(true);
    });

    expect(result.current[0].data).toEqual({ id: "1", name: "Service User 1" });
    expect(result.current[1].data).toEqual({ id: "2", name: "Service User 2" });

    await runtime.dispose();
  });

  it("should support mixed queries - some with runtime, some without", async () => {
    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        getUser: (id) => Effect.succeed({ id, name: `Service User ${id}` }),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);

    const { result } = renderHook(
      () =>
        useEffectQueries({
          queries: [
            // Query with runtime requirement
            {
              queryKey: ["user", "with-runtime"],
              queryFn: () =>
                Effect.gen(function* () {
                  const service = yield* UserService;
                  return yield* service.getUser("1");
                }),
              runtime,
            },
            // Query without runtime requirement
            {
              queryKey: ["user", "no-runtime"],
              queryFn: () => Effect.succeed({ id: "2", name: "Direct User" }),
            },
          ],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[1].isSuccess).toBe(true);
    });

    expect(result.current[0].data).toEqual({ id: "1", name: "Service User 1" });
    expect(result.current[1].data).toEqual({ id: "2", name: "Direct User" });

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
        useEffectQueries({
          queries: [
            {
              queryKey: ["user", "runtime-error"],
              queryFn: () =>
                Effect.gen(function* () {
                  const service = yield* UserService;
                  return yield* service.getUser("1");
                }),
              runtime,
              retry: false,
            },
          ],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isError).toBe(true);
    });

    expect(result.current[0].error).toBeInstanceOf(NetworkError);
    expect((result.current[0].error as NetworkError).message).toBe("Service unavailable");

    await runtime.dispose();
  });
});

// ============================================================================
// Type-level Tests (compile-time verification)
// ============================================================================

describe("useEffectQueries type-level tests", () => {
  it("should compile: effect without requirements, no runtime needed", () => {
    type Options = UseEffectQueryOptionsForUseQueries<
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

  it("should compile: effect with requirements, runtime required", () => {
    type Options = UseEffectQueryOptionsForUseQueries<
      { id: string; name: string },
      NetworkError,
      { id: string; name: string },
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
      queryFn: () =>
        Effect.gen(function* () {
          const service = yield* UserService;
          return yield* service.getUser("1");
        }),
      runtime: runtime,
    };

    expect(_options).toBeDefined();
  });
});

// ============================================================================
// skipToken Tests
// ============================================================================

describe("useEffectQueries with skipToken", () => {
  it("should skip individual queries when skipToken is passed", async () => {
    const { result } = renderHook(
      () =>
        useEffectQueries({
          queries: [
            {
              queryKey: ["user", "1"],
              queryFn: () => Effect.succeed({ id: "1", name: "Alice" }),
            },
            {
              queryKey: ["user", "skipped"],
              queryFn: skipToken,
            },
          ],
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
    });

    // First query should succeed
    expect(result.current[0].data).toEqual({ id: "1", name: "Alice" });

    // Second query should be skipped
    expect(result.current[1].isPending).toBe(true);
    expect(result.current[1].isFetching).toBe(false);
    expect(result.current[1].data).toBeUndefined();
  });

  it("should conditionally skip based on truthy/falsy value", async () => {
    const userIds: Array<string | null> = ["1", null, "3"];

    const { result } = renderHook(
      () =>
        useEffectQueries({
          queries: userIds.map((userId) => ({
            queryKey: ["user", userId] as const,
            queryFn: userId ? () => Effect.succeed({ id: userId, name: `User ${userId}` }) : skipToken,
          })),
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[2].isSuccess).toBe(true);
    });

    // First and third queries should succeed
    expect(result.current[0].data).toEqual({ id: "1", name: "User 1" });
    expect(result.current[2].data).toEqual({ id: "3", name: "User 3" });

    // Second query should be skipped
    expect(result.current[1].isPending).toBe(true);
    expect(result.current[1].isFetching).toBe(false);
  });

  it("should work with combine function when some queries are skipped", async () => {
    const { result } = renderHook(
      () =>
        useEffectQueries({
          queries: [
            {
              queryKey: ["user", "1"],
              queryFn: () => Effect.succeed({ id: "1", name: "Alice" }),
            },
            {
              queryKey: ["user", "skipped"],
              queryFn: skipToken,
            },
            {
              queryKey: ["user", "3"],
              queryFn: () => Effect.succeed({ id: "3", name: "Charlie" }),
            },
          ],
          combine: (results) => ({
            users: results.map((r) => r.data).filter(Boolean),
            pendingCount: results.filter((r) => r.isPending && !r.isFetching).length,
            successCount: results.filter((r) => r.isSuccess).length,
          }),
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.successCount).toBe(2);
    });

    expect(result.current.users).toEqual([
      { id: "1", name: "Alice" },
      { id: "3", name: "Charlie" },
    ]);
    expect(result.current.pendingCount).toBe(1); // The skipped query
  });

  it("should compile: skipToken without runtime option", () => {
    // Type-level test: when queryFn is skipToken, runtime should not be required
    type Options = UseEffectQueryOptionsForUseQueries<
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
});
