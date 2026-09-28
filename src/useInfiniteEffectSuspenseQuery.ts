import type { InfiniteData, QueryFunctionContext, QueryKey } from "@tanstack/react-query";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import type { Context, Effect, ManagedRuntime } from "effect";
import { createEffectQueryFn } from "./internal/createEffectQueryFn";
import type {
  UseInfiniteEffectSuspenseQueryOptions,
  UseInfiniteEffectSuspenseQueryResult,
} from "./types";

/**
 * A React Query infinite suspense query hook that works with Effect.
 *
 * @example
 * ```ts
 * import { useInfiniteEffectSuspenseQuery } from "@effect-react-query";
 * import { Effect } from "effect";
 *
 * // Effect without requirements (R = never)
 * const query = useInfiniteEffectSuspenseQuery({
 *   queryKey: ["posts"],
 *   queryFn: ({ pageParam }) => fetchPosts(pageParam), // Effect<PostsPage, NetworkError, never>
 *   initialPageParam: 0,
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * });
 * // query.data is always defined (component suspends until loaded)
 *
 * // Access paginated data
 * query.data.pages.flatMap(page => page.items);
 *
 * // Load more
 * query.fetchNextPage();
 *
 * // Effect with requirements - runtime is required
 * const query = useInfiniteEffectSuspenseQuery({
 *   queryKey: ["posts"],
 *   queryFn: ({ pageParam }) => fetchPostsWithService(pageParam),
 *   runtime: myRuntime,
 *   initialPageParam: 0,
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * });
 * ```
 */
export function useInfiniteEffectSuspenseQuery<
  TQueryFnData,
  TError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
>(
  options: UseInfiniteEffectSuspenseQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam,
    R
  >,
): UseInfiniteEffectSuspenseQueryResult<TData, TError> {
  const { queryFn, runtime, ...restOptions } = options as {
    queryFn: (
      context: QueryFunctionContext<TQueryKey, TPageParam>,
    ) => Effect.Effect<TQueryFnData, TError, R>;
    runtime?: Context.Context<R> | ManagedRuntime.ManagedRuntime<R, unknown>;
  } & Omit<
    UseInfiniteEffectSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam, R>,
    "queryFn" | "runtime"
  >;

  return useSuspenseInfiniteQuery<TQueryFnData, TError, TData, TQueryKey, TPageParam>({
    ...restOptions,
    queryFn: createEffectQueryFn(queryFn, runtime, (context) => context.signal),
  });
}
