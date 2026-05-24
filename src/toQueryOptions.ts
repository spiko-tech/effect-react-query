import type { FetchQueryOptions, QueryFunctionContext, QueryKey, SkipToken } from "@tanstack/react-query";
import { skipToken } from "@tanstack/react-query";
import type { Effect, ManagedRuntime, Runtime } from "effect";
import { createEffectQueryFn } from "./internal/createEffectQueryFn";
import type {
  DefinedInitialDataEffectQueryOptionsResult,
  UndefinedInitialDataEffectQueryOptionsResult,
  UseEffectQueryOptionsResult,
} from "./types";

/**
 * Converts Effect-based query options to standard React Query options
 * for use with queryClient methods like fetchQuery, ensureQueryData, prefetchQuery.
 *
 * @example
 * ```ts
 * import { effectQueryOptions, toQueryOptions } from "@effect-react-query";
 * import { Effect } from "effect";
 *
 * // Define reusable query options
 * const userQueryOptions = (userId: string) => effectQueryOptions({
 *   queryKey: ["user", userId] as const,
 *   queryFn: () => fetchUser(userId), // Effect<User, NetworkError, never>
 * });
 *
 * // Use with queryClient methods
 * await queryClient.fetchQuery(toQueryOptions(userQueryOptions("123")));
 * await queryClient.ensureQueryData(toQueryOptions(userQueryOptions("456")));
 * await queryClient.prefetchQuery(toQueryOptions(userQueryOptions("789")));
 *
 * // With runtime requirements
 * const protectedQueryOptions = (userId: string) => effectQueryOptions({
 *   queryKey: ["user", userId] as const,
 *   queryFn: () => fetchUserWithService(userId), // Effect<User, NetworkError, AuthService>
 *   runtime: authRuntime,
 * });
 *
 * await queryClient.fetchQuery(toQueryOptions(protectedQueryOptions("123")));
 * ```
 */

export function toQueryOptions<TQueryFnData, TError, TData, TQueryKey extends QueryKey, R>(
  options: DefinedInitialDataEffectQueryOptionsResult<TQueryFnData, TError, TData, TQueryKey, R>,
): FetchQueryOptions<TQueryFnData, TError, TQueryFnData, TQueryKey>;

export function toQueryOptions<TQueryFnData, TError, TData, TQueryKey extends QueryKey, R>(
  options: UndefinedInitialDataEffectQueryOptionsResult<TQueryFnData, TError, TData, TQueryKey, R>,
): FetchQueryOptions<TQueryFnData, TError, TQueryFnData, TQueryKey>;

export function toQueryOptions<TQueryFnData, TError, TData, TQueryKey extends QueryKey, R>(
  options: UseEffectQueryOptionsResult<TQueryFnData, TError, TData, TQueryKey, R>,
): FetchQueryOptions<TQueryFnData, TError, TQueryFnData, TQueryKey>;

export function toQueryOptions<TQueryFnData, TError, TData, TQueryKey extends QueryKey, R>(
  options: UseEffectQueryOptionsResult<TQueryFnData, TError, TData, TQueryKey, R>,
): FetchQueryOptions<TQueryFnData, TError, TQueryFnData, TQueryKey> {
  const { queryFn, runtime, select: _select, ...restOptions } = options as {
    queryFn:
      | ((context: QueryFunctionContext<TQueryKey>) => Effect.Effect<TQueryFnData, TError, R>)
      | SkipToken;
    runtime?: Runtime.Runtime<R> | ManagedRuntime.ManagedRuntime<R, unknown>;
    select?: unknown;
  } & Omit<UseEffectQueryOptionsResult<TQueryFnData, TError, TData, TQueryKey, R>, "queryFn" | "runtime" | "select">;

  if (queryFn === skipToken) {
    return {
      ...restOptions,
      queryFn: skipToken,
    };
  }

  return {
    ...restOptions,
    queryFn: createEffectQueryFn(queryFn, runtime, (context) => context.signal),
  };
}
