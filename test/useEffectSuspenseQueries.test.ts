import { renderHook, waitFor } from "@testing-library/react";
import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { UseEffectSuspenseQueryOptionsForUseQueries } from "../src";
import { useEffectSuspenseQueries } from "../src";
import { createSuspenseWrapper } from "./utils";

// Define errors using Schema.TaggedError
class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  message: Schema.String,
}) {}

// Define a service for testing runtime requirements
class UserService extends Context.Service<
  UserService,
  { readonly getUser: (id: string) => Effect.Effect<{ id: string; name: string }, NetworkError> }
>()("UserService") {}

// ============================================================================
// Hook Behavior Tests
// ============================================================================

describe("useEffectSuspenseQueries", () => {
  it("should return success data when all Effects succeed", async () => {
    const { result } = renderHook(
      () =>
        useEffectSuspenseQueries({
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
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[1].isSuccess).toBe(true);
    });

    // Data should always be defined in suspense queries
    expect(result.current[0].data).toEqual({ id: "1", name: "Alice" });
    expect(result.current[1].data).toEqual({ id: "2", name: "Bob" });
  });

  it("should have always-defined data (never undefined)", async () => {
    const { result } = renderHook(
      () =>
        useEffectSuspenseQueries({
          queries: [
            {
              queryKey: ["user", "defined"],
              queryFn: () => Effect.succeed({ id: "1", name: "Alice" }),
            },
          ],
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
    });

    // Type-level assertion: data is not optional in suspense queries
    const data: { id: string; name: string } = result.current[0].data;
    expect(data).toBeDefined();
    expect(data.id).toBe("1");
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
        useEffectSuspenseQueries({
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
      { wrapper: createSuspenseWrapper() },
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

  // Note: Interruption behavior in suspense queries can be tricky due to React's Suspense
  // lifecycle. The important behavior (cancellation via AbortSignal) is tested in
  // the non-suspense useEffectQueries tests. This test verifies basic unmount behavior.
  it("should not crash on unmount during pending query", async () => {
    let effectStarted = false;

    const { unmount } = renderHook(
      () =>
        useEffectSuspenseQueries({
          queries: [
            {
              queryKey: ["user", "unmount-test-suspense"],
              queryFn: () =>
                Effect.gen(function* () {
                  effectStarted = true;
                  yield* Effect.sleep("10 seconds");
                  return { id: "1", name: "User" };
                }),
            },
          ],
        }),
      { wrapper: createSuspenseWrapper() },
    );

    // Give some time for the effect to potentially start
    await new Promise((resolve) => setTimeout(resolve, 50));

    // This should not throw or cause issues
    unmount();

    expect(effectStarted).toBe(true);
  });
});

// ============================================================================
// Combine Function Tests
// ============================================================================

describe("useEffectSuspenseQueries with combine", () => {
  it("should support combine function to transform results", async () => {
    const { result } = renderHook(
      () =>
        useEffectSuspenseQueries({
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
            // In suspense queries, data is always defined
            users: results.map((r) => r.data),
            isAllSuccess: results.every((r) => r.isSuccess),
          }),
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isAllSuccess).toBe(true);
    });

    expect(result.current.users).toEqual([
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob" },
    ]);
  });
});

// ============================================================================
// Runtime Tests
// ============================================================================

describe("useEffectSuspenseQueries with runtime", () => {
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
        useEffectSuspenseQueries({
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
      { wrapper: createSuspenseWrapper() },
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
        useEffectSuspenseQueries({
          queries: [
            // Query with runtime requirement
            {
              queryKey: ["user", "with-runtime-suspense"],
              queryFn: () =>
                Effect.gen(function* () {
                  const service = yield* UserService;
                  return yield* service.getUser("1");
                }),
              runtime,
            },
            // Query without runtime requirement
            {
              queryKey: ["user", "no-runtime-suspense"],
              queryFn: () => Effect.succeed({ id: "2", name: "Direct User" }),
            },
          ],
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current[0].isSuccess).toBe(true);
      expect(result.current[1].isSuccess).toBe(true);
    });

    expect(result.current[0].data).toEqual({ id: "1", name: "Service User 1" });
    expect(result.current[1].data).toEqual({ id: "2", name: "Direct User" });

    await runtime.dispose();
  });
});

// ============================================================================
// Type-level Tests (compile-time verification)
// ============================================================================

describe("useEffectSuspenseQueries type-level tests", () => {
  it("should compile: effect without requirements, no runtime needed", () => {
    type Options = UseEffectSuspenseQueryOptionsForUseQueries<
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
    type Options = UseEffectSuspenseQueryOptionsForUseQueries<
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
