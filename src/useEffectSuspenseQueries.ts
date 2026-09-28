import type { QueryKey } from "@tanstack/react-query";
import { useSuspenseQueries } from "@tanstack/react-query";
import type { Context, Effect, ManagedRuntime } from "effect";
import { createEffectQueryFn } from "./internal/createEffectQueryFn";
import type { EffectSuspenseQueriesResults } from "./types";

/**
 * Base constraint for Effect suspense query options.
 * Uses a minimal shape to allow both inline options and effectQueryOptions() results.
 * The queryFn uses a generic function type to avoid contravariance issues with queryKey.
 */
type EffectSuspenseQueryOptionsBase = {
  queryKey: QueryKey;
  queryFn: (...args: any[]) => Effect.Effect<any, any, any>;
  runtime?: Context.Context<any> | ManagedRuntime.ManagedRuntime<any, any>;
};

/**
 * A React Query hook that runs multiple Effect-based queries in parallel with Suspense support.
 *
 * This hook wraps `useSuspenseQueries` to provide typed error handling for Effects.
 * Each query can have its own Effect requirements and runtime.
 * Data is always defined (never undefined) due to Suspense behavior.
 *
 * @example
 * ```ts
 * import { useEffectSuspenseQueries } from "@effect-react-query";
 * import { Effect } from "effect";
 *
 * // Multiple queries without requirements - data is always defined
 * const results = useEffectSuspenseQueries({
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
 * // Each result's data is guaranteed to be defined
 * const user1 = results[0].data; // { id: "1", name: "Alice" }
 * const user2 = results[1].data; // { id: "2", name: "Bob" }
 *
 * // With combine function
 * const users = useEffectSuspenseQueries({
 *   queries: [...],
 *   combine: (results) => results.map((r) => r.data),
 * });
 *
 * // With runtime for queries that have requirements
 * const results = useEffectSuspenseQueries({
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
export function useEffectSuspenseQueries<
  T extends ReadonlyArray<EffectSuspenseQueryOptionsBase>,
  TCombinedResult = EffectSuspenseQueriesResults<T>,
>(options: {
  queries: readonly [...T];
  combine?: (result: EffectSuspenseQueriesResults<T>) => TCombinedResult;
}): TCombinedResult {
  const transformedQueries = options.queries.map((query) => {
    const { queryFn, runtime, ...rest } = query as EffectSuspenseQueryOptionsBase &
      Record<string, unknown>;

    return {
      ...rest,
      queryFn: createEffectQueryFn(queryFn, runtime, (context) => context.signal),
    };
  });

  const result = useSuspenseQueries({
    queries: transformedQueries,
    combine: options.combine as (result: Array<any>) => TCombinedResult,
  });

  return result as TCombinedResult;
}
