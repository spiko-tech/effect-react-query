import type {
  DataTag,
  DefinedUseInfiniteQueryResult,
  DefinedUseQueryResult,
  GetNextPageParamFunction,
  GetPreviousPageParamFunction,
  InfiniteData,
  InitialDataFunction,
  NonUndefinedGuard,
  QueriesPlaceholderDataFunction,
  QueryFunctionContext,
  QueryKey,
  SkipToken,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryResult,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from "@tanstack/react-query";
import type { Effect, ManagedRuntime, Runtime } from "effect";

/**
 * Options for useEffectMutation hook.
 *
 * @typeParam TData - The success value type
 * @typeParam TError - The typed error type from Effect
 * @typeParam TVariables - The mutation input type
 * @typeParam TContext - The context type for optimistic updates
 * @typeParam R - The Effect requirements type
 */
export type UseEffectMutationOptions<
  TData,
  TError,
  TVariables = void,
  TContext = unknown,
  R = never,
> = Omit<UseMutationOptions<TData, TError, TVariables, TContext>, "mutationFn"> & {
  /**
   * The mutation function that returns an Effect.
   */
  mutationFn: (variables: TVariables) => Effect.Effect<TData, TError, R>;
} & RuntimeOption<R>;

/**
 * Runtime option - required when R is not never, forbidden when R is never.
 * Accepts either a Runtime or a ManagedRuntime.
 */
export type RuntimeOption<R> = [R] extends [never]
  ? { runtime?: undefined }
  : { runtime: Runtime.Runtime<R> | ManagedRuntime.ManagedRuntime<R, unknown> };

/**
 * The result of useEffectMutation hook.
 */
export type UseEffectMutationResult<
  TData,
  TError,
  TVariables,
  TContext = unknown,
> = UseMutationResult<TData, TError, TVariables, TContext>;

/**
 * Options for useEffectQuery hook.
 *
 * @typeParam TQueryFnData - The data type returned by the query function
 * @typeParam TError - The typed error type from Effect
 * @typeParam TData - The data type after transformation (defaults to TQueryFnData)
 * @typeParam TQueryKey - The query key type
 * @typeParam R - The Effect requirements type
 */
export type UseEffectQueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
> = Omit<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, "queryFn"> &
  (
    | ({
        /**
         * The query function that returns an Effect.
         * Receives the same QueryFunctionContext as standard useQuery.
         */
        queryFn: (
          context: QueryFunctionContext<TQueryKey>,
        ) => Effect.Effect<TQueryFnData, TError, R>;
      } & RuntimeOption<R>)
    | {
        queryFn: SkipToken;
        runtime?: never;
      }
  );

/**
 * Options for useEffectQuery with defined initial data.
 * When initialData is provided, the result data is guaranteed to be defined.
 */
export type DefinedInitialDataEffectQueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
> = Omit<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, "queryFn" | "initialData"> & {
  initialData: NonUndefinedGuard<TQueryFnData> | (() => NonUndefinedGuard<TQueryFnData>);
} & (
    | ({
        queryFn: (
          context: QueryFunctionContext<TQueryKey>,
        ) => Effect.Effect<TQueryFnData, TError, R>;
      } & RuntimeOption<R>)
    | { queryFn: SkipToken; runtime?: never }
  );

/**
 * Options for useEffectQuery with undefined initial data.
 */
export type UndefinedInitialDataEffectQueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
> = Omit<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, "queryFn" | "initialData"> & {
  initialData?:
    | undefined
    | InitialDataFunction<NonUndefinedGuard<TQueryFnData>>
    | NonUndefinedGuard<TQueryFnData>;
} & (
    | ({
        queryFn: (
          context: QueryFunctionContext<TQueryKey>,
        ) => Effect.Effect<TQueryFnData, TError, R>;
      } & RuntimeOption<R>)
    | { queryFn: SkipToken; runtime?: never }
  );

/**
 * The result of useEffectQuery hook.
 */
export type UseEffectQueryResult<TData = unknown, TError = unknown> = UseQueryResult<TData, TError>;

/**
 * The result of useEffectQuery hook when initial data is defined.
 */
export type DefinedUseEffectQueryResult<TData = unknown, TError = unknown> = DefinedUseQueryResult<
  TData,
  TError
>;

/**
 * Options for useEffectSuspenseQuery hook.
 *
 * @typeParam TQueryFnData - The data type returned by the query function
 * @typeParam TError - The typed error type from Effect
 * @typeParam TData - The data type after transformation (defaults to TQueryFnData)
 * @typeParam TQueryKey - The query key type
 * @typeParam R - The Effect requirements type
 */
export type UseEffectSuspenseQueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
> = Omit<
  UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  "queryFn" | "initialData"
> & {
  /**
   * The query function that returns an Effect.
   * Receives the same QueryFunctionContext as standard useSuspenseQuery.
   */
  queryFn: (context: QueryFunctionContext<TQueryKey>) => Effect.Effect<TQueryFnData, TError, R>;
  /**
   * Initial data for the query.
   */
  initialData?:
    | undefined
    | InitialDataFunction<NonUndefinedGuard<TQueryFnData>>
    | NonUndefinedGuard<TQueryFnData>;
} & RuntimeOption<R>;

/**
 * The result of useEffectSuspenseQuery hook.
 */
export type UseEffectSuspenseQueryResult<
  TData = unknown,
  TError = unknown,
> = UseSuspenseQueryResult<TData, TError>;

/**
 * Result type for effectQueryOptions with defined initial data.
 */
export type DefinedInitialDataEffectQueryOptionsResult<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
> = DefinedInitialDataEffectQueryOptions<TQueryFnData, TError, TData, TQueryKey, R> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>;
};

/**
 * Result type for effectQueryOptions with undefined initial data.
 */
export type UndefinedInitialDataEffectQueryOptionsResult<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
> = UndefinedInitialDataEffectQueryOptions<TQueryFnData, TError, TData, TQueryKey, R> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>;
};

/**
 * Result type for effectQueryOptions (general case).
 */
export type UseEffectQueryOptionsResult<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
> = UseEffectQueryOptions<TQueryFnData, TError, TData, TQueryKey, R> & {
  queryKey: DataTag<TQueryKey, TQueryFnData, TError>;
};

// ============================================================================
// Infinite Query Types
// ============================================================================

/**
 * Options for useInfiniteEffectQuery hook.
 *
 * @typeParam TQueryFnData - The data type returned by the query function (per page)
 * @typeParam TError - The typed error type from Effect
 * @typeParam TData - The data type after transformation (defaults to InfiniteData<TQueryFnData>)
 * @typeParam TQueryKey - The query key type
 * @typeParam TPageParam - The page parameter type
 * @typeParam R - The Effect requirements type
 */
export type UseInfiniteEffectQueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
> = Omit<
  UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  "queryFn" | "getNextPageParam" | "getPreviousPageParam"
> &
  (
    | ({
        /**
         * The query function that returns an Effect.
         * Receives the same QueryFunctionContext as standard useInfiniteQuery,
         * including pageParam for pagination.
         */
        queryFn: (
          context: QueryFunctionContext<TQueryKey, TPageParam>,
        ) => Effect.Effect<TQueryFnData, TError, R>;
        /**
         * Function to get the next page parameter.
         * Uses NoInfer to ensure TQueryFnData is inferred from queryFn, not from this callback.
         */
        getNextPageParam: GetNextPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
        /**
         * Optional function to get the previous page parameter.
         * Uses NoInfer to ensure TQueryFnData is inferred from queryFn, not from this callback.
         */
        getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
      } & RuntimeOption<R>)
    | {
        queryFn: SkipToken;
        runtime?: never;
        getNextPageParam?: GetNextPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
        getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
      }
  );

/**
 * Options for useInfiniteEffectQuery with defined initial data.
 * When initialData is provided, the result data is guaranteed to be defined.
 *
 * Note: This type is flattened (not using Omit on UseInfiniteEffectQueryOptions)
 * to enable proper TypeScript inference for TQueryFnData from queryFn.
 */
export type DefinedInitialDataInfiniteEffectQueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
> = Omit<
  UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  "queryFn" | "getNextPageParam" | "getPreviousPageParam" | "initialData"
> & {
  initialData:
    | NonUndefinedGuard<InfiniteData<TQueryFnData, TPageParam>>
    | (() => NonUndefinedGuard<InfiniteData<TQueryFnData, TPageParam>>);
} & (
    | ({
        queryFn: (
          context: QueryFunctionContext<TQueryKey, TPageParam>,
        ) => Effect.Effect<TQueryFnData, TError, R>;
        getNextPageParam: GetNextPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
        getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
      } & RuntimeOption<R>)
    | {
        queryFn: SkipToken;
        runtime?: never;
        getNextPageParam?: GetNextPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
        getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
      }
  );

/**
 * Options for useInfiniteEffectQuery with undefined initial data.
 *
 * Note: This type is flattened (not using Omit on UseInfiniteEffectQueryOptions)
 * to enable proper TypeScript inference for TQueryFnData from queryFn.
 */
export type UndefinedInitialDataInfiniteEffectQueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
> = Omit<
  UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  "queryFn" | "getNextPageParam" | "getPreviousPageParam" | "initialData"
> & {
  initialData?:
    | undefined
    | InitialDataFunction<NonUndefinedGuard<InfiniteData<TQueryFnData, TPageParam>>>
    | NonUndefinedGuard<InfiniteData<TQueryFnData, TPageParam>>;
} & (
    | ({
        queryFn: (
          context: QueryFunctionContext<TQueryKey, TPageParam>,
        ) => Effect.Effect<TQueryFnData, TError, R>;
        getNextPageParam: GetNextPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
        getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
      } & RuntimeOption<R>)
    | {
        queryFn: SkipToken;
        runtime?: never;
        getNextPageParam?: GetNextPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
        getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
      }
  );

/**
 * The result of useInfiniteEffectQuery hook.
 */
export type UseInfiniteEffectQueryResult<
  TData = unknown,
  TError = unknown,
> = UseInfiniteQueryResult<TData, TError>;

/**
 * The result of useInfiniteEffectQuery hook when initial data is defined.
 */
export type DefinedUseInfiniteEffectQueryResult<
  TData = unknown,
  TError = unknown,
> = DefinedUseInfiniteQueryResult<TData, TError>;

/**
 * Result type for infiniteEffectQueryOptions with defined initial data.
 */
export type DefinedInitialDataInfiniteEffectQueryOptionsResult<
  TQueryFnData = unknown,
  TError = unknown,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
> = DefinedInitialDataInfiniteEffectQueryOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryKey,
  TPageParam,
  R
> & {
  queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>;
};

/**
 * Result type for infiniteEffectQueryOptions with undefined initial data.
 */
export type UndefinedInitialDataInfiniteEffectQueryOptionsResult<
  TQueryFnData = unknown,
  TError = unknown,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
> = UndefinedInitialDataInfiniteEffectQueryOptions<
  TQueryFnData,
  TError,
  TData,
  TQueryKey,
  TPageParam,
  R
> & {
  queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>;
};

/**
 * Result type for infiniteEffectQueryOptions (general case).
 */
export type UseInfiniteEffectQueryOptionsResult<
  TQueryFnData = unknown,
  TError = unknown,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
> = UseInfiniteEffectQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam, R> & {
  queryKey: DataTag<TQueryKey, InfiniteData<TQueryFnData>, TError>;
};

// ============================================================================
// Infinite Suspense Query Types
// ============================================================================

/**
 * Options for useInfiniteEffectSuspenseQuery hook.
 *
 * Note: enabled, throwOnError, and placeholderData are not available in suspense queries.
 *
 * @typeParam TQueryFnData - The data type returned by the query function (per page)
 * @typeParam TError - The typed error type from Effect
 * @typeParam TData - The data type after transformation (defaults to InfiniteData<TQueryFnData>)
 * @typeParam TQueryKey - The query key type
 * @typeParam TPageParam - The page parameter type
 * @typeParam R - The Effect requirements type
 */
export type UseInfiniteEffectSuspenseQueryOptions<
  TQueryFnData = unknown,
  TError = unknown,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
  R = never,
> = Omit<
  UseSuspenseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
  "queryFn" | "getNextPageParam" | "getPreviousPageParam"
> & {
  /**
   * The query function that returns an Effect.
   * Receives the same QueryFunctionContext as standard useSuspenseInfiniteQuery,
   * including pageParam for pagination.
   */
  queryFn: (
    context: QueryFunctionContext<TQueryKey, TPageParam>,
  ) => Effect.Effect<TQueryFnData, TError, R>;
  /**
   * Function to get the next page parameter.
   * Uses NoInfer to ensure TQueryFnData is inferred from queryFn, not from this callback.
   */
  getNextPageParam: GetNextPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
  /**
   * Optional function to get the previous page parameter.
   * Uses NoInfer to ensure TQueryFnData is inferred from queryFn, not from this callback.
   */
  getPreviousPageParam?: GetPreviousPageParamFunction<TPageParam, NoInfer<TQueryFnData>>;
} & RuntimeOption<R>;

/**
 * The result of useInfiniteEffectSuspenseQuery hook.
 * Data is always defined (never undefined) due to Suspense behavior.
 */
export type UseInfiniteEffectSuspenseQueryResult<
  TData = unknown,
  TError = unknown,
> = UseSuspenseInfiniteQueryResult<TData, TError>;

// ============================================================================
// useEffectQueries Types
// ============================================================================

/**
 * Options for a single query within useEffectQueries.
 * Extends React Query's UseQueryOptions but replaces queryFn with an Effect-returning function.
 *
 * @typeParam TQueryFnData - The data type returned by the query function
 * @typeParam TError - The typed error type from Effect
 * @typeParam TData - The data type after transformation (defaults to TQueryFnData)
 * @typeParam TQueryKey - The query key type
 * @typeParam R - The Effect requirements type
 */
export type UseEffectQueryOptionsForUseQueries<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
> = Omit<
  UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  "queryFn" | "placeholderData" | "subscribed"
> & {
  /**
   * Placeholder data for this query.
   */
  placeholderData?: TQueryFnData | QueriesPlaceholderDataFunction<TQueryFnData>;
} & (
    | ({
        /**
         * The query function that returns an Effect.
         */
        queryFn: (
          context: QueryFunctionContext<TQueryKey>,
        ) => Effect.Effect<TQueryFnData, TError, R>;
      } & RuntimeOption<R>)
    | {
        queryFn: SkipToken;
        runtime?: never;
      }
  );

/**
 * Maps an array of Effect query options to an array of UseQueryResult.
 * Preserves tuple structure for proper type inference.
 * Infers data and error types from the queryFn's Effect return type.
 */
export type EffectQueriesResults<
  T extends ReadonlyArray<{
    queryFn?: ((...args: any) => Effect.Effect<any, any, any>) | SkipToken;
  }>,
> = {
  -readonly [K in keyof T]: T[K] extends {
    queryFn: (...args: any) => Effect.Effect<infer TData, infer TError, any>;
    select?: (data: any) => infer TSelected;
  }
    ? UseQueryResult<unknown extends TSelected ? TData : TSelected, TError>
    : T[K] extends { queryFn: (...args: any) => Effect.Effect<infer TData, infer TError, any> }
      ? UseQueryResult<TData, TError>
      : UseQueryResult;
};

// ============================================================================
// useEffectSuspenseQueries Types
// ============================================================================

/**
 * Options for a single query within useEffectSuspenseQueries.
 * Extends React Query's UseSuspenseQueryOptions but replaces queryFn with an Effect-returning function.
 *
 * @typeParam TQueryFnData - The data type returned by the query function
 * @typeParam TError - The typed error type from Effect
 * @typeParam TData - The data type after transformation (defaults to TQueryFnData)
 * @typeParam TQueryKey - The query key type
 * @typeParam R - The Effect requirements type
 */
export type UseEffectSuspenseQueryOptionsForUseQueries<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  R = never,
> = Omit<
  UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  "queryFn" | "enabled" | "throwOnError" | "placeholderData"
> & {
  /**
   * The query function that returns an Effect.
   */
  queryFn: (context: QueryFunctionContext<TQueryKey>) => Effect.Effect<TQueryFnData, TError, R>;
} & RuntimeOption<R>;

/**
 * Maps an array of Effect suspense query options to an array of UseSuspenseQueryResult.
 * Preserves tuple structure for proper type inference.
 * Infers data and error types from the queryFn's Effect return type.
 */
export type EffectSuspenseQueriesResults<
  T extends ReadonlyArray<{ queryFn: (...args: any) => Effect.Effect<any, any, any> }>,
> = {
  -readonly [K in keyof T]: T[K] extends {
    queryFn: (...args: any) => Effect.Effect<infer TData, infer TError, any>;
    select?: (data: any) => infer TSelected;
  }
    ? UseSuspenseQueryResult<unknown extends TSelected ? TData : TSelected, TError>
    : T[K] extends { queryFn: (...args: any) => Effect.Effect<infer TData, infer TError, any> }
      ? UseSuspenseQueryResult<TData, TError>
      : UseSuspenseQueryResult;
};
