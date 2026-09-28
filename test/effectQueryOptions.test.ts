import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect";
import { describe, expect, it } from "vitest";
import type {
  DefinedInitialDataEffectQueryOptionsResult,
  UndefinedInitialDataEffectQueryOptionsResult,
} from "../src";
import { effectQueryOptions } from "../src";

// Define errors using Schema.TaggedError
class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  message: Schema.String,
}) {}

// Define a service for testing runtime requirements
class UserService extends Context.Service<
  UserService,
  { readonly getUser: (id: string) => Effect.Effect<{ id: string; name: string }, NetworkError> }
>()("UserService") {}

describe("effectQueryOptions", () => {
  it("should export effectQueryOptions", () => {
    expect(effectQueryOptions).toBeDefined();
    expect(typeof effectQueryOptions).toBe("function");
  });

  it("should return options with queryKey", () => {
    const options = effectQueryOptions({
      queryKey: ["test"] as const,
      queryFn: () => Effect.succeed("test"),
    });

    expect(options.queryKey).toEqual(["test"]);
    expect(options.queryFn).toBeDefined();
  });

  it("should preserve all options", () => {
    const options = effectQueryOptions({
      queryKey: ["user", "123"] as const,
      queryFn: () => Effect.succeed({ id: "123", name: "Test" }),
      staleTime: 5000,
      gcTime: 10000,
      retry: 3,
    });

    expect(options.queryKey).toEqual(["user", "123"]);
    expect(options.staleTime).toBe(5000);
    expect(options.gcTime).toBe(10000);
    expect(options.retry).toBe(3);
  });
});

describe("effectQueryOptions type-level tests", () => {
  it("should compile: effect without requirements, no runtime needed", () => {
    const options = effectQueryOptions({
      queryKey: ["test"] as const,
      queryFn: () => Effect.succeed("test"),
    });

    // Type assertion to verify the return type
    const _typed: UndefinedInitialDataEffectQueryOptionsResult<
      string,
      never,
      string,
      readonly ["test"],
      never
    > = options;

    expect(_typed).toBeDefined();
  });

  it("should compile: effect with requirements, runtime required", () => {
    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        getUser: () => Effect.succeed({ id: "1", name: "Test" }),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);

    const options = effectQueryOptions({
      queryKey: ["user", "123"] as const,
      queryFn: () =>
        Effect.gen(function* () {
          const service = yield* UserService;
          return yield* service.getUser("123");
        }),
      runtime,
    });

    expect(options.runtime).toBe(runtime);
  });

  it("should compile: with defined initial data", () => {
    const options = effectQueryOptions({
      queryKey: ["user", "123"] as const,
      queryFn: () => Effect.succeed({ id: "123", name: "Test" }),
      initialData: { id: "initial", name: "Initial" },
    });

    // Type assertion to verify the return type includes initialData
    const _typed: DefinedInitialDataEffectQueryOptionsResult<
      { id: string; name: string },
      never,
      { id: string; name: string },
      readonly ["user", "123"],
      never
    > = options;

    expect(_typed.initialData).toEqual({ id: "initial", name: "Initial" });
  });

  it("should compile: with undefined initial data", () => {
    const options = effectQueryOptions({
      queryKey: ["user", "123"] as const,
      queryFn: () => Effect.succeed({ id: "123", name: "Test" }),
      initialData: undefined,
    });

    expect(options.initialData).toBeUndefined();
  });
});

describe("effectQueryOptions factory pattern", () => {
  it("should work as a factory function", () => {
    const userQueryOptions = (userId: string) =>
      effectQueryOptions({
        queryKey: ["user", userId] as const,
        queryFn: () => Effect.succeed({ id: userId, name: `User ${userId}` }),
      });

    const options1 = userQueryOptions("123");
    const options2 = userQueryOptions("456");

    expect(options1.queryKey).toEqual(["user", "123"]);
    expect(options2.queryKey).toEqual(["user", "456"]);
  });

  it("should work with runtime in factory", () => {
    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        getUser: (id) => Effect.succeed({ id, name: `User ${id}` }),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);

    const protectedUserQueryOptions = (userId: string) =>
      effectQueryOptions({
        queryKey: ["protected-user", userId] as const,
        queryFn: () =>
          Effect.gen(function* () {
            const service = yield* UserService;
            return yield* service.getUser(userId);
          }),
        runtime,
      });

    const options = protectedUserQueryOptions("123");

    expect(options.queryKey).toEqual(["protected-user", "123"]);
    expect(options.runtime).toBe(runtime);
  });
});

describe("effectQueryOptions queryKey type inference", () => {
  it("should infer queryKey type correctly", () => {
    const options = effectQueryOptions({
      queryKey: ["user", "123", { includeDetails: true }] as const,
      queryFn: (context) => {
        // Verify the queryKey type is correctly inferred
        const [resource, id, params] = context.queryKey;
        expect(resource).toBe("user");
        expect(id).toBe("123");
        expect(params.includeDetails).toBe(true);
        return Effect.succeed({ id, name: "Test" });
      },
    });

    expect(options.queryKey).toEqual(["user", "123", { includeDetails: true }]);
  });
});
