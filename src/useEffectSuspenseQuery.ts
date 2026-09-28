import type { QueryFunctionContext, QueryKey } from "@tanstack/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Context, Effect, ManagedRuntime } from "effect";
import { createEffectQueryFn } from "./internal/createEffectQueryFn";
import type { UseEffectSuspenseQueryOptions, UseEffectSuspenseQueryResult } from "./types";

/**
 * A React Query suspense hook that works with Effect.
 *
 * This hook wraps `useSuspenseQuery` to provide typed error handling for Effects.
 *
 *
 * @example
 * ```ts
 * import { useEffectSuspenseQuery } from "@effect-react-query";
 * import { Effect } from "effect";
 *
 * // Effect without requirements (R = never)
 * const query = useEffectSuspenseQuery({
 *   queryKey: ["user", userId],
 *   queryFn: () => fetchUser(userId), // Effect<User, NetworkError, never>
 * });
 *
 * // Effect with requirements - runtime is required
 * const query = useEffectSuspenseQuery({
 *   queryKey: ["user", userId],
 *   queryFn: () => fetchUserWithService(userId), // Effect<User, NetworkError, UserService>
 *   runtime: myRuntime, // Context<UserService> or ManagedRuntime<UserService>
 * });
 * ```
 */
export function useEffectSuspenseQuery<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
>(
  options: UseEffectSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey, R>,
): UseEffectSuspenseQueryResult<TData, TError> {
  const { queryFn, runtime, ...restOptions } = options as {
    queryFn: (context: QueryFunctionContext<TQueryKey>) => Effect.Effect<TQueryFnData, TError, R>;
    runtime?: Context.Context<R> | ManagedRuntime.ManagedRuntime<R, unknown>;
  } & Omit<
    UseEffectSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey, R>,
    "queryFn" | "runtime"
  >;

  return useSuspenseQuery<TQueryFnData, TError, TData, TQueryKey>({
    ...restOptions,
    queryFn: createEffectQueryFn(queryFn, runtime, (context) => context.signal),
  });
}
