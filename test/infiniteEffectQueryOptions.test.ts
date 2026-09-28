import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { infiniteEffectQueryOptions } from "../src";

// Define errors using Schema.TaggedError
class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  message: Schema.String,
}) {}

// Define a page type for testing
interface PostsPage {
  items: Array<{ id: string; title: string }>;
  nextCursor: number | null;
}

// Define a service for testing runtime requirements
class PostService extends Context.Service<
  PostService,
  { readonly getPosts: (cursor: number) => Effect.Effect<PostsPage, NetworkError> }
>()("PostService") {}

describe("infiniteEffectQueryOptions", () => {
  it("should export infiniteEffectQueryOptions", () => {
    expect(infiniteEffectQueryOptions).toBeDefined();
    expect(typeof infiniteEffectQueryOptions).toBe("function");
  });

  it("should return options with queryKey", () => {
    const options = infiniteEffectQueryOptions({
      queryKey: ["posts"] as const,
      queryFn: ({ pageParam }) =>
        Effect.succeed({
          items: [{ id: "1", title: `Post at ${pageParam}` }],
          nextCursor: pageParam + 1,
        }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    expect(options.queryKey).toEqual(["posts"]);
    expect(options.queryFn).toBeDefined();
    expect(options.initialPageParam).toBe(0);
  });

  it("should preserve all options", () => {
    const options = infiniteEffectQueryOptions({
      queryKey: ["posts", "category-1"] as const,
      queryFn: ({ pageParam }) =>
        Effect.succeed({
          items: [{ id: "1", title: `Post at ${pageParam}` }],
          nextCursor: pageParam + 1,
        }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      getPreviousPageParam: (firstPage) => (firstPage.nextCursor ? firstPage.nextCursor - 2 : null),
      staleTime: 5000,
      gcTime: 10000,
    });

    expect(options.queryKey).toEqual(["posts", "category-1"]);
    expect(options.staleTime).toBe(5000);
    expect(options.gcTime).toBe(10000);
    expect(options.getPreviousPageParam).toBeDefined();
  });
});

describe("infiniteEffectQueryOptions type-level tests", () => {
  it("should infer TQueryFnData from queryFn return type", () => {
    const options = infiniteEffectQueryOptions({
      queryKey: ["posts"] as const,
      // Using context parameter - this was previously breaking inference
      queryFn: ({ pageParam }) =>
        Effect.succeed({
          items: [{ id: "1", title: `Post at ${pageParam}` }],
          nextCursor: pageParam + 1,
        }),
      initialPageParam: 0,
      // lastPage should be correctly inferred as { items: ..., nextCursor: number }
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    // Verify the options are correctly typed
    expect(options.queryKey).toEqual(["posts"]);
    expect(options.getNextPageParam).toBeDefined();

    // Verify getNextPageParam works with the inferred type
    const nextPage = options.getNextPageParam(
      { items: [{ id: "1", title: "Test" }], nextCursor: 5 },
      [{ items: [], nextCursor: 1 }],
      0,
      [0],
    );
    expect(nextPage).toBe(5);
  });

  it("should compile: effect with requirements, runtime required", () => {
    const PostServiceLive = Layer.succeed(
      PostService,
      PostService.of({
        getPosts: (cursor) =>
          Effect.succeed({
            items: [{ id: "1", title: `Post at ${cursor}` }],
            nextCursor: cursor + 1,
          }),
      }),
    );

    const runtime = ManagedRuntime.make(PostServiceLive);

    const options = infiniteEffectQueryOptions({
      queryKey: ["posts"] as const,
      queryFn: ({ pageParam }) =>
        Effect.gen(function* () {
          const service = yield* PostService;
          return yield* service.getPosts(pageParam);
        }),
      runtime,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    expect(options.runtime).toBe(runtime);
  });

  it("should compile: with defined initial data", () => {
    const options = infiniteEffectQueryOptions({
      queryKey: ["posts"] as const,
      queryFn: ({ pageParam }) =>
        Effect.succeed({
          items: [{ id: "1", title: `Post at ${pageParam}` }],
          nextCursor: pageParam < 10 ? pageParam + 1 : null,
        }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialData: {
        pages: [{ items: [{ id: "initial", title: "Initial Post" }], nextCursor: 1 }],
        pageParams: [0],
      },
    });

    // Verify initialData is accessible and correctly typed
    expect(options.initialData).toBeDefined();
    if (typeof options.initialData === "object" && options.initialData !== null) {
      expect(options.initialData.pages).toHaveLength(1);
    }
  });
});

describe("infiniteEffectQueryOptions factory pattern", () => {
  it("should work as a factory function", () => {
    const postsQueryOptions = (category: string) =>
      infiniteEffectQueryOptions({
        queryKey: ["posts", category] as const,
        queryFn: ({ pageParam }) =>
          Effect.succeed({
            items: [{ id: "1", title: `Post in ${category} at ${pageParam}` }],
            nextCursor: pageParam + 1,
          }),
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      });

    const options1 = postsQueryOptions("tech");
    const options2 = postsQueryOptions("science");

    expect(options1.queryKey).toEqual(["posts", "tech"]);
    expect(options2.queryKey).toEqual(["posts", "science"]);
  });

  it("should work with runtime in factory", () => {
    const PostServiceLive = Layer.succeed(
      PostService,
      PostService.of({
        getPosts: (cursor) =>
          Effect.succeed({
            items: [{ id: "1", title: `Post at ${cursor}` }],
            nextCursor: cursor + 1,
          }),
      }),
    );

    const runtime = ManagedRuntime.make(PostServiceLive);

    const protectedPostsOptions = (category: string) =>
      infiniteEffectQueryOptions({
        queryKey: ["protected-posts", category] as const,
        queryFn: ({ pageParam }) =>
          Effect.gen(function* () {
            const service = yield* PostService;
            return yield* service.getPosts(pageParam);
          }),
        runtime,
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      });

    const options = protectedPostsOptions("tech");

    expect(options.queryKey).toEqual(["protected-posts", "tech"]);
    expect(options.runtime).toBe(runtime);
  });
});

describe("infiniteEffectQueryOptions queryKey type inference", () => {
  it("should infer queryKey type correctly", () => {
    const options = infiniteEffectQueryOptions({
      queryKey: ["posts", "category-1", { featured: true }] as const,
      queryFn: (context) => {
        // Verify the queryKey type is correctly inferred
        const [resource, category, params] = context.queryKey;
        expect(resource).toBe("posts");
        expect(category).toBe("category-1");
        expect(params.featured).toBe(true);
        return Effect.succeed({
          items: [{ id: "1", title: "Post" }],
          nextCursor: context.pageParam + 1,
        });
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    });

    expect(options.queryKey).toEqual(["posts", "category-1", { featured: true }]);
  });
});
