import type {
  InfiniteData,
  QueryFunctionContext,
  QueryKey,
} from "@tanstack/react-query";
import { skipToken, useInfiniteQuery } from "@tanstack/react-query";
import type { Effect, ManagedRuntime, Runtime } from "effect";
import { createEffectQueryFn } from "./internal/createEffectQueryFn";
import type {
  DefinedInitialDataInfiniteEffectQueryOptions,
  DefinedUseInfiniteEffectQueryResult,
  UndefinedInitialDataInfiniteEffectQueryOptions,
  UseInfiniteEffectQueryOptions,
  UseInfiniteEffectQueryResult,
} from "./types";

/**
 * A React Query infinite query hook that works with Effect.
 *
 * This hook wraps `useInfiniteQuery` to provide typed error handling for Effects.
 * It supports pagination with `fetchNextPage`, `fetchPreviousPage`, etc.
 *
 * @example
 * ```ts
 * import { useInfiniteEffectQuery } from "@effect-react-query";
 * import { Effect } from "effect";
 *
 * // Effect without requirements (R = never)
 * const query = useInfiniteEffectQuery({
 *   queryKey: ["posts"],
 *   queryFn: ({ pageParam }) => fetchPosts(pageParam), // Effect<Post[], NetworkError, never>
 *   initialPageParam: 0,
 *   getNextPageParam: (lastPage, pages) => lastPage.nextCursor,
 * });
 *
 * // Access paginated data
 * query.data?.pages.flatMap(page => page.items);
 *
 * // Load more
 * query.fetchNextPage();
 *
 * // Effect with requirements - runtime is required
 * const query = useInfiniteEffectQuery({
 *   queryKey: ["posts"],
 *   queryFn: ({ pageParam }) => fetchPostsWithService(pageParam),
 *   runtime: myRuntime,
 *   initialPageParam: 0,
 *   getNextPageParam: (lastPage) => lastPage.nextCursor,
 * });
 * ```
 */

export function useInfiniteEffectQuery<
  TQueryFnData,
  TError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
>(
  options: DefinedInitialDataInfiniteEffectQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam,
    R
  >,
): DefinedUseInfiniteEffectQueryResult<TData, TError>;

export function useInfiniteEffectQuery<
  TQueryFnData,
  TError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
>(
  options: UndefinedInitialDataInfiniteEffectQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam,
    R
  >,
): UseInfiniteEffectQueryResult<TData, TError>;

export function useInfiniteEffectQuery<
  TQueryFnData,
  TError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
>(
  options: UseInfiniteEffectQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam,
    R
  >,
): UseInfiniteEffectQueryResult<TData, TError>;

// Implementation
export function useInfiniteEffectQuery<
  TQueryFnData,
  TError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
>(
  options: UseInfiniteEffectQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam,
    R
  >,
): UseInfiniteEffectQueryResult<TData, TError> {
  const { queryFn, runtime, getNextPageParam, ...restOptions } = options as {
    queryFn:
      | ((
          context: QueryFunctionContext<TQueryKey, TPageParam>,
        ) => Effect.Effect<TQueryFnData, TError, R>)
      | typeof skipToken;
    runtime?: Runtime.Runtime<R> | ManagedRuntime.ManagedRuntime<R, unknown>;
    getNextPageParam?: (
      lastPage: TQueryFnData,
      allPages: TQueryFnData[],
    ) => TPageParam | undefined | null;
  } & Omit<
    UseInfiniteEffectQueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey,
      TPageParam,
      R
    >,
    "queryFn" | "runtime" | "getNextPageParam"
  >;

  if (queryFn === skipToken) {
    return useInfiniteQuery<TQueryFnData, TError, TData, TQueryKey, TPageParam>(
      {
        ...restOptions,
        queryFn: skipToken,
        // Provide a dummy getNextPageParam when using skipToken (it won't be called)
        getNextPageParam: getNextPageParam ?? (() => undefined),
      },
    );
  }

  return useInfiniteQuery<TQueryFnData, TError, TData, TQueryKey, TPageParam>({
    ...restOptions,
    getNextPageParam: getNextPageParam!,
    queryFn: createEffectQueryFn(queryFn, runtime, (context) => context.signal),
  });
}
