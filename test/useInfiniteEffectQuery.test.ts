import type { InfiniteData } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Context, Effect, Layer, ManagedRuntime, Match, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";
import type {
  DefinedInitialDataInfiniteEffectQueryOptions,
  DefinedUseInfiniteEffectQueryResult,
  UseInfiniteEffectQueryOptions,
  UseInfiniteEffectQueryResult,
} from "../src";
import { skipToken, useInfiniteEffectQuery } from "../src";
import { createWrapper } from "./utils";

// Define errors using Schema.TaggedError
class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  message: Schema.String,
}) {}

class NotFoundError extends Schema.TaggedError<NotFoundError>()("NotFoundError", {
  resourceId: Schema.String,
}) {}

// Define a page type for testing
interface PostsPage {
  items: Array<{ id: string; title: string }>;
  nextCursor: number | null;
}

// Define a service for testing runtime requirements
class PostService extends Context.Tag("PostService")<
  PostService,
  { readonly getPosts: (cursor: number) => Effect.Effect<PostsPage, NetworkError> }
>() {}

// ============================================================================
// Hook Behavior Tests
// ============================================================================

describe("useInfiniteEffectQuery", () => {
  it("should return success data when Effect succeeds", async () => {
    const { result } = renderHook(
      () =>
        useInfiniteEffectQuery({
          queryKey: ["posts", "success"],
          queryFn: ({ pageParam }) =>
            Effect.succeed({
              items: [{ id: "1", title: `Post at ${pageParam}` }],
              nextCursor: pageParam < 2 ? pageParam + 1 : null,
            }),
          initialPageParam: 0,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0].items[0].title).toBe("Post at 0");
  });

  it("should fetch next page when fetchNextPage is called", async () => {
    const { result } = renderHook(
      () =>
        useInfiniteEffectQuery({
          queryKey: ["posts", "pagination"],
          queryFn: ({ pageParam }) =>
            Effect.succeed({
              items: [{ id: String(pageParam), title: `Page ${pageParam}` }],
              nextCursor: pageParam < 2 ? pageParam + 1 : null,
            }),
          initialPageParam: 0,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.data?.pages).toHaveLength(1);

    // Call fetchNextPage and wait for the fetch to complete
    act(() => {
      result.current.fetchNextPage();
    });

    // Wait for isFetchingNextPage to become true then false
    await waitFor(() => {
      expect(result.current.isFetchingNextPage).toBe(false);
      expect(result.current.data?.pages).toHaveLength(2);
    });

    expect(result.current.data?.pages[1].items[0].title).toBe("Page 1");
  });

  it("should set error when Effect fails", async () => {
    const { result } = renderHook(
      () =>
        useInfiniteEffectQuery({
          queryKey: ["posts", "fail"],
          queryFn: () => Effect.fail(new NetworkError({ message: "Connection failed" })),
          initialPageParam: 0,
          getNextPageParam: () => null,
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
        useInfiniteEffectQuery({
          queryKey: ["posts", "error-match"],
          queryFn: () => Effect.fail(new NetworkError({ message: "Timeout" })),
          initialPageParam: 0,
          getNextPageParam: () => null,
          retry: false,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const matchResult = Match.valueTags(result.current.error!, {
      NetworkError: (e) => `Network: ${e.message}`,
    });

    expect(matchResult).toBe("Network: Timeout");
  });

  it("should pass pageParam and queryKey in context to queryFn", async () => {
    const queryFn = vi.fn((context: { pageParam: number; queryKey: readonly ["posts", string] }) =>
      Effect.succeed({
        items: [{ id: "1", title: `Page ${context.pageParam}` }],
        nextCursor: context.pageParam < 2 ? context.pageParam + 1 : null,
      }),
    );

    const { result } = renderHook(
      () =>
        useInfiniteEffectQuery({
          queryKey: ["posts", "context-test"] as const,
          queryFn,
          initialPageParam: 0,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(queryFn).toHaveBeenCalled();
    const callArg = queryFn.mock.calls[0][0];
    expect(callArg.pageParam).toBe(0);
    expect(callArg.queryKey).toEqual(["posts", "context-test"]);
  });

  it("should handle interruption via AbortSignal", async () => {
    let wasInterrupted = false;
    let effectStarted = false;

    const { unmount } = renderHook(
      () =>
        useInfiniteEffectQuery({
          queryKey: ["posts", "interrupted"],
          queryFn: () =>
            Effect.gen(function* () {
              effectStarted = true;
              yield* Effect.sleep("10 seconds");
              return { items: [], nextCursor: null };
            }).pipe(
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  wasInterrupted = true;
                }),
              ),
            ),
          initialPageParam: 0,
          getNextPageParam: () => null,
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

  it("should handle hasNextPage correctly", async () => {
    const { result } = renderHook(
      () =>
        useInfiniteEffectQuery({
          queryKey: ["posts", "has-next"],
          queryFn: ({ pageParam }) =>
            Effect.succeed({
              items: [{ id: String(pageParam), title: `Page ${pageParam}` }],
              nextCursor: pageParam === 0 ? 1 : null, // Only first page has next
            }),
          initialPageParam: 0,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.data?.pages).toHaveLength(2);
    });

    expect(result.current.hasNextPage).toBe(false);
  });
});

// ============================================================================
// Initial Data Tests
// ============================================================================

describe("useInfiniteEffectQuery with initial data", () => {
  it("should have defined data immediately with initialData", async () => {
    const { result } = renderHook(
      () =>
        useInfiniteEffectQuery({
          queryKey: ["posts", "initial"],
          queryFn: ({ pageParam }) =>
            Effect.succeed({
              items: [{ id: "fetched", title: `Fetched Page ${pageParam}` }],
              nextCursor: null,
            }),
          initialPageParam: 0,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
          initialData: {
            pages: [{ items: [{ id: "initial", title: "Initial Post" }], nextCursor: null }],
            pageParams: [0],
          },
        }),
      { wrapper: createWrapper() },
    );

    // Data should be immediately available
    expect(result.current.data?.pages[0].items[0].title).toBe("Initial Post");
  });
});

// ============================================================================
// Runtime Tests
// ============================================================================

describe("useInfiniteEffectQuery with runtime", () => {
  it("should work with ManagedRuntime", async () => {
    const PostServiceLive = Layer.succeed(
      PostService,
      PostService.of({
        getPosts: (cursor) =>
          Effect.succeed({
            items: [{ id: String(cursor), title: `Service Page ${cursor}` }],
            nextCursor: cursor < 1 ? cursor + 1 : null,
          }),
      }),
    );

    const runtime = ManagedRuntime.make(PostServiceLive);

    const { result } = renderHook(
      () =>
        useInfiniteEffectQuery({
          queryKey: ["posts", "runtime"],
          queryFn: ({ pageParam }) =>
            Effect.gen(function* () {
              const service = yield* PostService;
              return yield* service.getPosts(pageParam);
            }),
          runtime,
          initialPageParam: 0,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.pages[0].items[0].title).toBe("Service Page 0");

    await runtime.dispose();
  });

  it("should handle errors from runtime services", async () => {
    const PostServiceLive = Layer.succeed(
      PostService,
      PostService.of({
        getPosts: () => Effect.fail(new NetworkError({ message: "Service unavailable" })),
      }),
    );

    const runtime = ManagedRuntime.make(PostServiceLive);

    const { result } = renderHook(
      () =>
        useInfiniteEffectQuery({
          queryKey: ["posts", "runtime-error"],
          queryFn: ({ pageParam }) =>
            Effect.gen(function* () {
              const service = yield* PostService;
              return yield* service.getPosts(pageParam);
            }),
          runtime,
          initialPageParam: 0,
          getNextPageParam: () => null,
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

describe("useInfiniteEffectQuery type-level tests", () => {
  it("should compile: effect without requirements, no runtime needed", () => {
    type Options = UseInfiniteEffectQueryOptions<
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

    type Options = UseInfiniteEffectQueryOptions<
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

  it("should have correct result type structure", () => {
    type Result = UseInfiniteEffectQueryResult<InfiniteData<PostsPage>, NetworkError>;

    const checkResultType = (result: Result) => {
      const _hasNextPage: boolean | undefined = result.hasNextPage;
      const _hasPreviousPage: boolean | undefined = result.hasPreviousPage;
      const _isFetchingNextPage: boolean = result.isFetchingNextPage;
      const _isFetchingPreviousPage: boolean = result.isFetchingPreviousPage;
      return { _hasNextPage, _hasPreviousPage, _isFetchingNextPage, _isFetchingPreviousPage };
    };

    expect(checkResultType).toBeDefined();
  });

  it("should have data always defined with defined initial data", () => {
    type Result = DefinedUseInfiniteEffectQueryResult<InfiniteData<PostsPage>, NetworkError>;

    const checkDataType = (result: Result) => {
      const _data: InfiniteData<PostsPage> = result.data;
      return _data;
    };

    expect(checkDataType).toBeDefined();
  });

  it("should compile: with defined initial data", () => {
    type Options = DefinedInitialDataInfiniteEffectQueryOptions<
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
      initialData: {
        pages: [{ items: [{ id: "initial", title: "Initial Post" }], nextCursor: 1 }],
        pageParams: [0],
      },
    };

    expect(_options.initialData).toBeDefined();
  });
});

// ============================================================================
// skipToken Tests
// ============================================================================

describe("useInfiniteEffectQuery with skipToken", () => {
  it("should skip the query when skipToken is passed", async () => {
    const { result } = renderHook(
      () =>
        useInfiniteEffectQuery({
          queryKey: ["posts", "skipped"],
          queryFn: skipToken,
          initialPageParam: 0,
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
    const category: string | null = null;

    const { result } = renderHook(
      () =>
        useInfiniteEffectQuery({
          queryKey: ["posts", category],
          queryFn: category
            ? ({ pageParam }) =>
                Effect.succeed({
                  items: [{ id: String(pageParam), title: `Post in ${category}` }],
                  nextCursor: null,
                })
            : skipToken,
          initialPageParam: 0,
        }),
      { wrapper: createWrapper() },
    );

    // Query should be skipped
    expect(result.current.isPending).toBe(true);
    expect(result.current.isFetching).toBe(false);
  });

  it("should execute query when condition becomes truthy", async () => {
    const { result, rerender } = renderHook(
      ({ category }: { category: string | null }) =>
        useInfiniteEffectQuery({
          queryKey: ["posts", category],
          queryFn: category
            ? ({ pageParam }) =>
                Effect.succeed({
                  items: [{ id: String(pageParam), title: `Post in ${category}` }],
                  nextCursor: null,
                })
            : skipToken,
          initialPageParam: 0,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        }),
      {
        wrapper: createWrapper(),
        initialProps: { category: null },
      },
    );

    // Initially skipped
    expect(result.current.isPending).toBe(true);
    expect(result.current.isFetching).toBe(false);

    // Re-render with a valid category
    rerender({ category: "tech" });

    // Now it should fetch
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.pages[0].items[0].title).toBe("Post in tech");
  });

  it("should compile: skipToken without runtime option", () => {
    // This is a type-level test - when queryFn is skipToken, runtime should not be required
    type Options = UseInfiniteEffectQueryOptions<
      PostsPage,
      NetworkError,
      InfiniteData<PostsPage>,
      readonly ["posts", string],
      number,
      PostService // Has requirements, but skipToken should not require runtime
    >;

    const _options: Options = {
      queryKey: ["posts", "category"] as const,
      queryFn: skipToken,
      initialPageParam: 0,
      // runtime is NOT required when using skipToken
      // getNextPageParam is also not required when using skipToken
    };

    expect(_options).toBeDefined();
    expect(_options.queryFn).toBe(skipToken);
  });
});
