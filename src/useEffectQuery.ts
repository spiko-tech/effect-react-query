import type { QueryFunctionContext, QueryKey } from "@tanstack/react-query";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { Effect, ManagedRuntime, Runtime } from "effect";
import { createEffectQueryFn } from "./internal/createEffectQueryFn";
import type {
  DefinedInitialDataEffectQueryOptions,
  DefinedUseEffectQueryResult,
  UndefinedInitialDataEffectQueryOptions,
  UseEffectQueryOptions,
  UseEffectQueryResult,
} from "./types";

/**
 * A React Query hook that works with Effect.
 *
 * This hook wraps `useQuery` to provide typed error handling for Effects.
 * The error type from the Effect is preserved and can be matched using
 * Effect's pattern matching utilities.
 *
 * @example
 * ```ts
 * import { useEffectQuery } from "@effect-react-query";
 * import { Match, Schema, Effect } from "effect";
 *
 * // Effect without requirements (R = never)
 * const query = useEffectQuery({
 *   queryKey: ["user", userId],
 *   queryFn: () => fetchUser(userId), // Effect<User, NetworkError, never>
 * });
 *
 * // Effect with requirements - runtime is required
 * const query = useEffectQuery({
 *   queryKey: ["user", userId],
 *   queryFn: () => fetchUserWithService(userId), // Effect<User, NetworkError, UserService>
 *   runtime: myRuntime, // Runtime<UserService>
 * });
 *
 * // Handle errors with Match
 * if (query.error) {
 *   Match.valueTags(query.error, {
 *     NetworkError: (e) => toast.error(e.message),
 *   });
 * }
 * ```
 */

export function useEffectQuery<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
>(
  options: DefinedInitialDataEffectQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    R
  >,
): DefinedUseEffectQueryResult<TData, TError>;

export function useEffectQuery<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
>(
  options: UndefinedInitialDataEffectQueryOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    R
  >,
): UseEffectQueryResult<TData, TError>;

export function useEffectQuery<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
>(
  options: UseEffectQueryOptions<TQueryFnData, TError, TData, TQueryKey, R>,
): UseEffectQueryResult<TData, TError>;

// Implementation
export function useEffectQuery<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
>(
  options: UseEffectQueryOptions<TQueryFnData, TError, TData, TQueryKey, R>,
): UseEffectQueryResult<TData, TError> {
  const { queryFn, runtime, ...restOptions } = options as {
    queryFn:
      | ((
          context: QueryFunctionContext<TQueryKey>,
        ) => Effect.Effect<TQueryFnData, TError, R>)
      | typeof skipToken;
    runtime?: Runtime.Runtime<R> | ManagedRuntime.ManagedRuntime<R, unknown>;
  } & Omit<
    UseEffectQueryOptions<TQueryFnData, TError, TData, TQueryKey, R>,
    "queryFn" | "runtime"
  >;

  if (queryFn === skipToken) {
    return useQuery<TQueryFnData, TError, TData, TQueryKey>({
      ...restOptions,
      queryFn: skipToken,
    });
  }

  return useQuery<TQueryFnData, TError, TData, TQueryKey>({
    ...restOptions,
    queryFn: createEffectQueryFn(queryFn, runtime, (context) => context.signal),
  });
}
