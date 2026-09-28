import { Cause, Context, Effect, Exit } from "effect";
import type { ManagedRuntime } from "effect";

/**
 * Creates a query function that wraps an Effect-returning function.
 * Handles runtime execution, AbortSignal cancellation, and error handling.
 *
 * @internal
 */
export function createEffectQueryFn<TQueryFnData, TError, TContext, R>(
  effectFn: (context: TContext) => Effect.Effect<TQueryFnData, TError, R>,
  runtime: Context.Context<R> | ManagedRuntime.ManagedRuntime<R, unknown> | undefined,
  getSignal: (context: TContext) => AbortSignal,
): (context: TContext) => Promise<TQueryFnData> {
  return async (context: TContext) => {
    const effect = effectFn(context);
    const options = { signal: getSignal(context) };

    // Determine how to run the effect based on runtime type
    // Use unknown for error type since ManagedRuntime can add layer errors
    let exit: Exit.Exit<TQueryFnData, unknown>;

    if (runtime) {
      if (Context.isContext(runtime)) {
        exit = await Effect.runPromiseExitWith(runtime)(effect, options);
      } else {
        exit = await runtime.runPromiseExit(effect, options);
      }
    } else {
      exit = await Effect.runPromiseExit(
        effect as Effect.Effect<TQueryFnData, TError, never>,
        options,
      );
    }

    if (Exit.isSuccess(exit)) return exit.value;

    const cause = exit.cause;

    // Check for interruption - don't call onError, just hang
    // React Query will handle cleanup
    if (Cause.hasInterruptsOnly(cause)) {
      return new Promise<TQueryFnData>(() => {
        // Never resolves - query is cancelled
      });
    }

    throw Cause.squash(cause);
  };
}
