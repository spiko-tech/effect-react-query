import type { InfiniteData } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import type {
  UseInfiniteEffectSuspenseQueryOptions,
  UseInfiniteEffectSuspenseQueryResult,
} from "../src";
import { useInfiniteEffectSuspenseQuery } from "../src";
import { createSuspenseWrapper } from "./utils";

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

// ============================================================================
// Hook Behavior Tests
// ============================================================================

describe("useInfiniteEffectSuspenseQuery", () => {
  it("should return success data when Effect succeeds", async () => {
    const { result } = renderHook(
      () =>
        useInfiniteEffectSuspenseQuery({
          queryKey: ["suspense-posts", "success"],
          queryFn: ({ pageParam }) =>
            Effect.succeed({
              items: [{ id: "1", title: `Post at ${pageParam}` }],
              nextCursor: pageParam < 2 ? pageParam + 1 : null,
            }),
          initialPageParam: 0,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // In suspense queries, data is always defined
    expect(result.current.data.pages).toHaveLength(1);
    expect(result.current.data.pages[0].items[0].title).toBe("Post at 0");
  });

  it("should have data always defined (not undefined)", async () => {
    const { result } = renderHook(
      () =>
        useInfiniteEffectSuspenseQuery({
          queryKey: ["suspense-posts", "defined"],
          queryFn: () =>
            Effect.succeed({
              items: [{ id: "1", title: "Post" }],
              nextCursor: null,
            }),
          initialPageParam: 0,
          getNextPageParam: () => null,
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Type assertion to verify data is not undefined
    const data: InfiniteData<PostsPage> = result.current.data;
    expect(data).toBeDefined();
    expect(data.pages).toHaveLength(1);
  });

  it("should fetch next page when fetchNextPage is called", async () => {
    const { result } = renderHook(
      () =>
        useInfiniteEffectSuspenseQuery({
          queryKey: ["suspense-posts", "pagination"],
          queryFn: ({ pageParam }) =>
            Effect.succeed({
              items: [{ id: String(pageParam), title: `Page ${pageParam}` }],
              nextCursor: pageParam < 2 ? pageParam + 1 : null,
            }),
          initialPageParam: 0,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.data.pages).toHaveLength(1);

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.isFetchingNextPage).toBe(false);
      expect(result.current.data.pages).toHaveLength(2);
    });

    expect(result.current.data.pages[1].items[0].title).toBe("Page 1");
  });

  it("should pass pageParam and queryKey in context to queryFn", async () => {
    const queryFn = vi.fn(
      (context: { pageParam: number; queryKey: readonly ["suspense-posts", string] }) =>
        Effect.succeed({
          items: [{ id: "1", title: `Page ${context.pageParam}` }],
          nextCursor: null,
        }),
    );

    const { result } = renderHook(
      () =>
        useInfiniteEffectSuspenseQuery({
          queryKey: ["suspense-posts", "context-test"] as const,
          queryFn,
          initialPageParam: 0,
          getNextPageParam: () => null,
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(queryFn).toHaveBeenCalled();
    const callArg = queryFn.mock.calls[0][0];
    expect(callArg.pageParam).toBe(0);
    expect(callArg.queryKey).toEqual(["suspense-posts", "context-test"]);
  });
});

// ============================================================================
// Runtime Tests
// ============================================================================

describe("useInfiniteEffectSuspenseQuery with runtime", () => {
  it("should work with ManagedRuntime", async () => {
    const PostServiceLive = Layer.succeed(
      PostService,
      PostService.of({
        getPosts: (cursor) =>
          Effect.succeed({
            items: [{ id: String(cursor), title: `Service Page ${cursor}` }],
            nextCursor: null,
          }),
      }),
    );

    const runtime = ManagedRuntime.make(PostServiceLive);

    const { result } = renderHook(
      () =>
        useInfiniteEffectSuspenseQuery({
          queryKey: ["suspense-posts", "runtime"],
          queryFn: ({ pageParam }) =>
            Effect.gen(function* () {
              const service = yield* PostService;
              return yield* service.getPosts(pageParam);
            }),
          runtime,
          initialPageParam: 0,
          getNextPageParam: () => null,
        }),
      { wrapper: createSuspenseWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data.pages[0].items[0].title).toBe("Service Page 0");

    await runtime.dispose();
  });
});

// ============================================================================
// Type-level Tests (compile-time verification)
// ============================================================================

describe("useInfiniteEffectSuspenseQuery type-level tests", () => {
  it("should compile: effect without requirements, no runtime needed", () => {
    type Options = UseInfiniteEffectSuspenseQueryOptions<
      PostsPage,
      NetworkError,
      InfiniteData<PostsPage>,
      readonly ["posts"],
      number,
      never
    >;

    const _options: Options = {
      queryKey: ["posts"] as const,
      queryFn: ({ pageParam }) =>
        Effect.succeed({
          items: [{ id: "1", title: `Post at ${pageParam}` }],
          nextCursor: pageParam + 1,
        }),
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    };

    expect(_options).toBeDefined();
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

    type Options = UseInfiniteEffectSuspenseQueryOptions<
      PostsPage,
      NetworkError,
      InfiniteData<PostsPage>,
      readonly ["posts"],
      number,
      PostService
    >;

    const _options: Options = {
      queryKey: ["posts"] as const,
      queryFn: ({ pageParam }) =>
        Effect.gen(function* () {
          const service = yield* PostService;
          return yield* service.getPosts(pageParam);
        }),
      runtime,
      initialPageParam: 0,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    };

    expect(_options).toBeDefined();
  });

  it("should have data always defined in result type", () => {
    type Result = UseInfiniteEffectSuspenseQueryResult<InfiniteData<PostsPage>, NetworkError>;

    const checkDataType = (result: Result) => {
      const _data: InfiniteData<PostsPage> = result.data;
      const _hasNextPage: boolean = result.hasNextPage;
      const _hasPreviousPage: boolean = result.hasPreviousPage;
      return { _data, _hasNextPage, _hasPreviousPage };
    };

    expect(checkDataType).toBeDefined();
  });

  it("should not allow enabled option", () => {
    type Options = UseInfiniteEffectSuspenseQueryOptions<
      PostsPage,
      NetworkError,
      InfiniteData<PostsPage>,
      readonly ["posts"],
      number,
      never
    >;

    type HasEnabled = "enabled" extends keyof Options ? true : false;
    const _hasEnabled: HasEnabled = false;

    expect(_hasEnabled).toBe(false);
  });

  it("should not allow throwOnError option", () => {
    type Options = UseInfiniteEffectSuspenseQueryOptions<
      PostsPage,
      NetworkError,
      InfiniteData<PostsPage>,
      readonly ["posts"],
      number,
      never
    >;

    type HasThrowOnError = "throwOnError" extends keyof Options ? true : false;
    const _hasThrowOnError: HasThrowOnError = false;

    expect(_hasThrowOnError).toBe(false);
  });

  it("should not allow placeholderData option", () => {
    type Options = UseInfiniteEffectSuspenseQueryOptions<
      PostsPage,
      NetworkError,
      InfiniteData<PostsPage>,
      readonly ["posts"],
      number,
      never
    >;

    type HasPlaceholderData = "placeholderData" extends keyof Options ? true : false;
    const _hasPlaceholderData: HasPlaceholderData = false;

    expect(_hasPlaceholderData).toBe(false);
  });
});
