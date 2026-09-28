import { act, renderHook, waitFor } from "@testing-library/react";
import { Context, Effect, Layer, ManagedRuntime, Match, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import type { UseEffectMutationOptions } from "../src";
import { useEffectMutation } from "../src";
import { createWrapper } from "./utils";

// Define errors using Schema.TaggedError
class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  message: Schema.String,
}) {}

class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", {
  fields: Schema.Record(Schema.String, Schema.String),
}) {}

// Define a service for testing runtime requirements
class UserService extends Context.Service<
  UserService,
  {
    readonly createUser: (
      name: string,
    ) => Effect.Effect<{ id: string; name: string }, NetworkError>;
  }
>()("UserService") {}

// ============================================================================
// Hook Behavior Tests
// ============================================================================

describe("useEffectMutation", () => {
  it("should return success data when Effect succeeds", async () => {
    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: (name: string) => Effect.succeed({ id: "1", name }),
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate("Test User");
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: "1", name: "Test User" });
  });

  it("should set error when Effect fails", async () => {
    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: () => Effect.fail(new NetworkError({ message: "Connection failed" })),
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // The error should be the typed error, not a Cause wrapper
    expect(result.current.error).toBeInstanceOf(NetworkError);
    expect(result.current.error?._tag).toBe("NetworkError");
    expect((result.current.error as NetworkError)?.message).toBe("Connection failed");
  });

  it("should call onSuccess callback with data", async () => {
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: (name: string) => Effect.succeed({ id: "1", name }),
          onSuccess,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate("Test User");
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0]).toEqual({ id: "1", name: "Test User" });
    expect(onSuccess.mock.calls[0][1]).toBe("Test User");
  });

  it("should call onError callback with typed error (not Cause)", async () => {
    const onError = vi.fn();

    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: () => Effect.fail(new NetworkError({ message: "Connection failed" })),
          onError,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // This is the key test - onError should receive the typed error, not a Cause
    expect(onError).toHaveBeenCalledTimes(1);
    const errorArg = onError.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(NetworkError);
    expect(errorArg._tag).toBe("NetworkError");
    expect(errorArg.message).toBe("Connection failed");
  });

  it("should work with Match.valueTags in onError callback", async () => {
    let matchedError: string | null = null;

    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: () => Effect.fail(new NetworkError({ message: "Connection lost" })),
          onError: Match.valueTags({
            NetworkError: (e) => {
              matchedError = e.message;
            },
          }),
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(matchedError).toBe("Connection lost");
  });

  it("should handle multiple error types with Match.valueTags", async () => {
    const results: string[] = [];

    const { result, rerender } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: (type: "network" | "validation") =>
            Effect.gen(function* () {
              return yield* type === "network"
                ? new NetworkError({ message: "Network down" })
                : new ValidationError({ fields: { email: "Invalid" } });
            }),
          onError: Match.valueTags({
            NetworkError: (e) => results.push(`Network: ${e.message}`),
            ValidationError: (e) => results.push(`Validation: ${Object.keys(e.fields).join(", ")}`),
          }),
        }),
      { wrapper: createWrapper() },
    );

    // Test NetworkError
    await act(async () => {
      result.current.mutate("network");
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Reset and test ValidationError
    rerender();
    await act(async () => {
      result.current.reset();
    });

    await act(async () => {
      result.current.mutate("validation");
    });

    await waitFor(() => {
      expect(results).toContain("Network: Network down");
      expect(results).toContain("Validation: email");
    });
  });

  it("should handle Effect.die (defects) correctly", async () => {
    const onError = vi.fn();
    const defect = new Error("Unexpected crash");

    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: () => Effect.die(defect),
          onError,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Defects should be thrown as-is
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(defect);
  });

  it("should handle Effect.interrupt correctly (not call onError)", async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: () => Effect.interrupt,
          onError,
          onSuccess,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate(undefined);
    });

    // Wait a bit to ensure callbacks would have been called if they were going to be
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Interruption should NOT call onError or onSuccess - it just hangs
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();

    // The mutation should still be pending (not error, not success)
    expect(result.current.isPending).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.isSuccess).toBe(false);
  });

  it("should pass variables to mutationFn", async () => {
    const mutationFn = vi.fn((data: { name: string; age: number }) =>
      Effect.succeed({ id: "1", ...data }),
    );

    const { result } = renderHook(() => useEffectMutation({ mutationFn }), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ name: "John", age: 30 });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mutationFn).toHaveBeenCalledWith({ name: "John", age: 30 });
  });
});

// ============================================================================
// Runtime Tests
// ============================================================================

describe("useEffectMutation with runtime", () => {
  it("should work with ManagedRuntime", async () => {
    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        createUser: (name) => Effect.succeed({ id: "1", name }),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);

    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: (name: string) =>
            Effect.gen(function* () {
              const service = yield* UserService;
              return yield* service.createUser(name);
            }),
          runtime,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate("Test User");
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: "1", name: "Test User" });

    await runtime.dispose();
  });

  it("should handle errors from runtime services", async () => {
    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        createUser: () => Effect.fail(new NetworkError({ message: "Service unavailable" })),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);
    const onError = vi.fn();

    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: (name: string) =>
            Effect.gen(function* () {
              const service = yield* UserService;
              return yield* service.createUser(name);
            }),
          runtime,
          onError,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate("Test User");
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    const errorArg = onError.mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(NetworkError);
    expect(errorArg.message).toBe("Service unavailable");

    await runtime.dispose();
  });
});

// ============================================================================
// TVariables = void default behavior tests
// ============================================================================

describe("useEffectMutation with no variables (TVariables = void)", () => {
  it("should allow calling mutate() with no arguments when mutationFn takes no parameters", async () => {
    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: () => Effect.succeed({ id: "1", name: "No Args User" }),
        }),
      { wrapper: createWrapper() },
    );

    // This should compile and work - mutate() with no arguments
    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: "1", name: "No Args User" });
  });

  it("should allow calling mutate() with no arguments when mutationFn fails", async () => {
    const onError = vi.fn();

    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: () => Effect.fail(new NetworkError({ message: "No args failure" })),
          onError,
        }),
      { wrapper: createWrapper() },
    );

    // This should compile and work - mutate() with no arguments
    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(NetworkError);
  });

  it("should work with Match.valueTags in onError when mutationFn takes no parameters", async () => {
    let matchedError: string | null = null;

    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: () => Effect.fail(new NetworkError({ message: "Void param error" })),
          onError: Match.valueTags({
            NetworkError: (e) => {
              matchedError = e.message;
            },
          }),
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(matchedError).toBe("Void param error");
  });

  it("should work with runtime when mutationFn takes no parameters", async () => {
    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        createUser: (name) => Effect.succeed({ id: "1", name }),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);

    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: () =>
            Effect.gen(function* () {
              const service = yield* UserService;
              return yield* service.createUser("Default User");
            }),
          runtime,
        }),
      { wrapper: createWrapper() },
    );

    // mutate() with no arguments should work with runtime
    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({ id: "1", name: "Default User" });

    await runtime.dispose();
  });

  it("should call onSuccess callback when mutationFn takes no parameters", async () => {
    const onSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useEffectMutation({
          mutationFn: () => Effect.succeed({ id: "1", name: "Success User" }),
          onSuccess,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0]).toEqual({ id: "1", name: "Success User" });
    // Variables should be undefined when TVariables is void
    expect(onSuccess.mock.calls[0][1]).toBeUndefined();
  });
});

// ============================================================================
// Type-level Tests (compile-time verification)
// ============================================================================

describe("useEffectMutation type-level tests", () => {
  it("should compile: effect without requirements, no runtime needed", () => {
    type EffectNoReqs = Effect.Effect<string, NetworkError, never>;
    type Options = UseEffectMutationOptions<string, NetworkError, void, unknown, never>;

    const _options: Options = {
      mutationFn: (): EffectNoReqs => Effect.succeed("test"),
    };

    expect(_options).toBeDefined();
  });

  it("should compile: effect with requirements, runtime required", () => {
    type EffectWithReqs = Effect.Effect<string, NetworkError, UserService>;
    type Options = UseEffectMutationOptions<string, NetworkError, void, unknown, UserService>;

    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        createUser: () => Effect.succeed({ id: "1", name: "Test" }),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);

    const _options: Options = {
      mutationFn: (): EffectWithReqs =>
        Effect.gen(function* () {
          const service = yield* UserService;
          const user = yield* service.createUser("Test");
          return user.name;
        }),
      runtime: runtime,
    };

    expect(_options).toBeDefined();
  });

  it("should compile: TVariables defaults to void when not specified", () => {
    // This test verifies the type-level fix for TVariables = void default
    // If this compiles, the fix is working correctly
    type OptionsWithVoidDefault = UseEffectMutationOptions<
      { id: string },
      NetworkError
      // TVariables not specified - should default to void
    >;

    const _options: OptionsWithVoidDefault = {
      mutationFn: () => Effect.succeed({ id: "1" }),
    };

    expect(_options).toBeDefined();
  });
});
