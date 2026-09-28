import { useMutation } from "@tanstack/react-query";
import { Cause, Context, Effect, Exit } from "effect";
import type { UseEffectMutationOptions, UseEffectMutationResult } from "./types";

/**
 * A React Query mutation hook that works with Effect.
 *
 * @example
 * ```ts
 * import { useEffectMutation } from "@effect-react-query";
 * import { Match, Schema } from "effect";
 *
 * // Define your errors with Schema.TaggedError
 * class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
 *   message: Schema.String,
 * }) {}
 *
 * // Effect without requirements (R = never)
 * const mutation = useEffectMutation({
 *   mutationFn: createUser, // Effect<User, NetworkError, never>
 *   onError: Match.valueTags({
 *     NetworkError: (e) => toast.error(e.message),
 *   }),
 * });
 *
 * // Effect with requirements - runtime is required
 * const mutation = useEffectMutation({
 *   mutationFn: createUserWithService, // Effect<User, NetworkError, UserService>
 *   runtime: myRuntime, // Context<UserService> or ManagedRuntime<UserService>
 *   onError: Match.valueTags({
 *     NetworkError: (e) => toast.error(e.message),
 *   }),
 * });
 * ```
 */
export function useEffectMutation<TData, TError, TVariables = void, TContext = unknown, R = never>(
  options: UseEffectMutationOptions<TData, TError, TVariables, TContext, R>,
): UseEffectMutationResult<TData, TError, TVariables, TContext> {
  const { mutationFn, runtime, ...restOptions } = options;

  const mutation = useMutation<TData, TError, TVariables, TContext>({
    ...restOptions,
    mutationFn: async (variables: TVariables) => {
      const effect = mutationFn(variables);

      // Determine how to run the effect based on runtime type
      // Use unknown for error type since ManagedRuntime can add layer errors
      let exit: Exit.Exit<TData, unknown>;

      if (runtime) {
        if (Context.isContext(runtime)) {
          exit = await Effect.runPromiseExitWith(runtime)(effect);
        } else {
          exit = await runtime.runPromiseExit(effect);
        }
      } else {
        exit = await Effect.runPromiseExit(effect as Effect.Effect<TData, TError, never>);
      }

      if (Exit.isSuccess(exit)) return exit.value;

      const cause = exit.cause;

      // Check for interruption - don't call onError, just hang
      // React Query will handle cleanup
      if (Cause.hasInterruptsOnly(cause)) {
        return new Promise<TData>(() => {
          // Never resolves - mutation is cancelled
        });
      }

      throw Cause.squash(cause);
    },
  });

  return mutation;
}
