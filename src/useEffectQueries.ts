import type { QueryKey, SkipToken } from "@tanstack/react-query";
import { skipToken, useQueries } from "@tanstack/react-query";
import type { Effect, ManagedRuntime, Runtime } from "effect";
import { createEffectQueryFn } from "./internal/createEffectQueryFn";
import type { EffectQueriesResults } from "./types";

/**
 * Base constraint for Effect query options.
 * Uses a minimal shape to allow both inline options and effectQueryOptions() results.
 * The queryFn uses a generic function type to avoid contravariance issues with queryKey.
 */
type EffectQueryOptionsBase = {
  queryKey: QueryKey;
  queryFn: ((...args: any[]) => Effect.Effect<any, any, any>) | SkipToken;
  runtime?:
    | Runtime.Runtime<any>
    | ManagedRuntime.ManagedRuntime<any, any>
    | undefined;
};

/**
 * A React Query hook that runs multiple Effect-based queries in parallel.
 *
 * This hook wraps `useQueries` to provide typed error handling for Effects.
 * Each query can have its own Effect requirements and runtime.
 *
 * @example
 * ```ts
 * import { useEffectQueries } from "@effect-react-query";
 * import { Effect } from "effect";
 *
 * // Multiple queries without requirements
 * const results = useEffectQueries({
 *   queries: [
 *     {
 *       queryKey: ["user", "1"],
 *       queryFn: () => Effect.succeed({ id: "1", name: "Alice" }),
 *     },
 *     {
 *       queryKey: ["user", "2"],
 *       queryFn: () => Effect.succeed({ id: "2", name: "Bob" }),
 *     },
 *   ],
 * });
 *
 * // With combine function
 * const { users, isLoading } = useEffectQueries({
 *   queries: [...],
 *   combine: (results) => ({
 *     users: results.map((r) => r.data).filter(Boolean),
 *     isLoading: results.some((r) => r.isLoading),
 *   }),
 * });
 *
 * // With runtime for queries that have requirements
 * const results = useEffectQueries({
 *   queries: [
 *     {
 *       queryKey: ["user", "1"],
 *       queryFn: () => UserService.pipe(Effect.flatMap((s) => s.getUser("1"))),
 *       runtime: myRuntime,
 *     },
 *   ],
 * });
 * ```
 */
export function useEffectQueries<
  T extends ReadonlyArray<EffectQueryOptionsBase>,
  TCombinedResult = EffectQueriesResults<T>,
>(options: {
  queries: readonly [...T];
  combine?: (result: EffectQueriesResults<T>) => TCombinedResult;
}): TCombinedResult {
  const transformedQueries = options.queries.map((query) => {
    const { queryFn, runtime, ...rest } = query as EffectQueryOptionsBase &
      Record<string, unknown>;

    if (queryFn === skipToken) {
      return {
        ...rest,
        queryFn: skipToken,
      };
    }

    return {
      ...rest,
      queryFn: createEffectQueryFn(
        queryFn,
        runtime,
        (context) => context.signal,
      ),
    };
  });

  const result = useQueries({
    queries: transformedQueries as any,
    combine: options.combine as (result: Array<any>) => TCombinedResult,
  });

  return result as TCombinedResult;
}
