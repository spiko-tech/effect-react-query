import { QueryClient } from "@tanstack/react-query";
import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { effectQueryOptions, toQueryOptions } from "../src";

// Define errors using Schema.TaggedError
class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  message: Schema.String,
}) {}

class NotFoundError extends Schema.TaggedError<NotFoundError>()("NotFoundError", {
  id: Schema.String,
}) {}

// Define a service for testing runtime requirements
class UserService extends Context.Service<
  UserService,
  { readonly getUser: (id: string) => Effect.Effect<{ id: string; name: string }, NetworkError> }
>()("UserService") {}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
}

describe("toQueryOptions", () => {
  it("should export toQueryOptions", () => {
    expect(toQueryOptions).toBeDefined();
    expect(typeof toQueryOptions).toBe("function");
  });

  it("should convert effect query options to standard query options", () => {
    const options = effectQueryOptions({
      queryKey: ["test"] as const,
      queryFn: () => Effect.succeed("test-data"),
    });

    const converted = toQueryOptions(options);

    expect(converted.queryKey).toEqual(["test"]);
    expect(converted.queryFn).toBeDefined();
    expect(typeof converted.queryFn).toBe("function");
  });

  it("should preserve queryKey and other options", () => {
    const options = effectQueryOptions({
      queryKey: ["user", "123"] as const,
      queryFn: () => Effect.succeed({ id: "123", name: "Test" }),
      staleTime: 5000,
      gcTime: 10000,
      retry: 3,
    });

    const converted = toQueryOptions(options);

    expect(converted.queryKey).toEqual(["user", "123"]);
    expect(converted.staleTime).toBe(5000);
    expect(converted.gcTime).toBe(10000);
    expect(converted.retry).toBe(3);
  });

  it("should strip select option from output", () => {
    const options = effectQueryOptions({
      queryKey: ["user", "123"] as const,
      queryFn: () => Effect.succeed({ id: "123", name: "Test" }),
      select: (data) => data.name,
    });

    const converted = toQueryOptions(options);

    // select should be stripped
    expect((converted as unknown as Record<string, unknown>).select).toBeUndefined();
  });
});

describe("toQueryOptions with queryClient", () => {
  it("should work with queryClient.fetchQuery", async () => {
    const queryClient = createTestQueryClient();

    const options = effectQueryOptions({
      queryKey: ["fetch-test"] as const,
      queryFn: () => Effect.succeed({ value: 42 }),
    });

    const result = await queryClient.fetchQuery(toQueryOptions(options));

    expect(result).toEqual({ value: 42 });
  });

  it("should work with queryClient.ensureQueryData", async () => {
    const queryClient = createTestQueryClient();

    const options = effectQueryOptions({
      queryKey: ["ensure-test"] as const,
      queryFn: () => Effect.succeed({ value: "ensured" }),
    });

    const result = await queryClient.ensureQueryData(toQueryOptions(options));

    expect(result).toEqual({ value: "ensured" });
  });

  it("should work with queryClient.prefetchQuery", async () => {
    const queryClient = createTestQueryClient();

    const options = effectQueryOptions({
      queryKey: ["prefetch-test"] as const,
      queryFn: () => Effect.succeed({ value: "prefetched" }),
    });

    // prefetchQuery returns void
    await queryClient.prefetchQuery(toQueryOptions(options));

    // Verify data is in cache
    const cachedData = queryClient.getQueryData(["prefetch-test"]);
    expect(cachedData).toEqual({ value: "prefetched" });
  });

  it("should work with queryClient.fetchQuery using factory pattern", async () => {
    const queryClient = createTestQueryClient();

    const userQueryOptions = (userId: string) =>
      effectQueryOptions({
        queryKey: ["user", userId] as const,
        queryFn: () => Effect.succeed({ id: userId, name: `User ${userId}` }),
      });

    const result = await queryClient.fetchQuery(toQueryOptions(userQueryOptions("456")));

    expect(result).toEqual({ id: "456", name: "User 456" });
  });
});

describe("toQueryOptions with runtime", () => {
  it("should work with ManagedRuntime", async () => {
    const queryClient = createTestQueryClient();

    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        getUser: (id) => Effect.succeed({ id, name: `User ${id}` }),
      }),
    );

    const runtime = ManagedRuntime.make(UserServiceLive);

    const options = effectQueryOptions({
      queryKey: ["user-with-service", "123"] as const,
      queryFn: () =>
        Effect.gen(function* () {
          const service = yield* UserService;
          return yield* service.getUser("123");
        }),
      runtime,
    });

    const result = await queryClient.fetchQuery(toQueryOptions(options));

    expect(result).toEqual({ id: "123", name: "User 123" });

    // Cleanup
    await runtime.dispose();
  });

  it("should work with a Context", async () => {
    const queryClient = createTestQueryClient();

    const UserServiceLive = Layer.succeed(
      UserService,
      UserService.of({
        getUser: (id) => Effect.succeed({ id, name: `Runtime User ${id}` }),
      }),
    );

    const runtime = await Effect.runPromise(Layer.build(UserServiceLive).pipe(Effect.scoped));

    const options = effectQueryOptions({
      queryKey: ["user-standard-runtime", "789"] as const,
      queryFn: () =>
        Effect.gen(function* () {
          const service = yield* UserService;
          return yield* service.getUser("789");
        }),
      runtime,
    });

    const result = await queryClient.fetchQuery(toQueryOptions(options));

    expect(result).toEqual({ id: "789", name: "Runtime User 789" });
  });
});

describe("toQueryOptions error handling", () => {
  it("should throw typed errors from Effect", async () => {
    const queryClient = createTestQueryClient();

    const options = effectQueryOptions({
      queryKey: ["error-test"] as const,
      queryFn: () => Effect.fail(new NetworkError({ message: "Connection failed" })),
    });

    await expect(queryClient.fetchQuery(toQueryOptions(options))).rejects.toThrow(NetworkError);
  });

  it("should preserve error properties", async () => {
    const queryClient = createTestQueryClient();

    const options = effectQueryOptions({
      queryKey: ["error-props-test"] as const,
      queryFn: () => Effect.fail(new NotFoundError({ id: "123" })),
    });

    try {
      await queryClient.fetchQuery(toQueryOptions(options));
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).id).toBe("123");
    }
  });
});

describe("toQueryOptions type inference", () => {
  it("should infer queryKey type correctly", () => {
    const options = effectQueryOptions({
      queryKey: ["user", "123", { includeDetails: true }] as const,
      queryFn: () => Effect.succeed({ id: "123", name: "Test" }),
    });

    const converted = toQueryOptions(options);

    // Type-level test: queryKey should maintain its type
    const [resource, id, params] = converted.queryKey!;
    expect(resource).toBe("user");
    expect(id).toBe("123");
    expect(params.includeDetails).toBe(true);
  });

  it("should compile: effect without requirements, no runtime needed", () => {
    const options = effectQueryOptions({
      queryKey: ["test"] as const,
      queryFn: () => Effect.succeed("test"),
    });

    // This should compile without errors
    const converted = toQueryOptions(options);
    expect(converted).toBeDefined();
  });

  it("should compile: effect with requirements, runtime provided", () => {
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

    // This should compile without errors
    const converted = toQueryOptions(options);
    expect(converted).toBeDefined();
    expect((converted as unknown as Record<string, unknown>).runtime).toBeUndefined();
  });
});

describe("toQueryOptions with initialData", () => {
  it("should preserve initialData", () => {
    const options = effectQueryOptions({
      queryKey: ["user", "123"] as const,
      queryFn: () => Effect.succeed({ id: "123", name: "Test" }),
      initialData: { id: "initial", name: "Initial" },
    });

    const converted = toQueryOptions(options);

    expect(converted.initialData).toEqual({ id: "initial", name: "Initial" });
  });

  it("should work with initialData function", () => {
    const options = effectQueryOptions({
      queryKey: ["user", "123"] as const,
      queryFn: () => Effect.succeed({ id: "123", name: "Test" }),
      initialData: () => ({ id: "initial-fn", name: "Initial Function" }),
    });

    const converted = toQueryOptions(options);

    expect(typeof converted.initialData).toBe("function");
    expect((converted.initialData as () => { id: string; name: string })()).toEqual({
      id: "initial-fn",
      name: "Initial Function",
    });
  });
});
