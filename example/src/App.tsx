import {
  effectQueryOptions,
  useEffectMutation,
  useEffectQueries,
  useEffectSuspenseQuery,
} from "@spiko-tech/effect-react-query";
import { Effect, Match } from "effect";
import { apiClient } from "./client";

export function App() {
  const { mutate } = useEffectMutation({
    mutationFn: (payload: "success" | "error" | "die") =>
      apiClient.pipe(Effect.flatMap((client) => client.api.testMutation({ payload }))),
    onSuccess: () => console.log("Fetched successfully"),
    onError: Match.valueTags({
      HttpApiDecodeError: (e) => console.error("Decode error:", e.message),
      ParseError: (e) => console.error("Parse error:", e.message),
      RequestError: (e) => console.error("Request error:", e.message),
      ResponseError: (e) => console.error("Response error:", e.message),
      BadRequest: () => console.error("BadRequest"),
    }),
  });

  const queryOptions = effectQueryOptions({
    queryKey: ["test"] as const,
    queryFn: () =>
      Effect.gen(function* () {
        const client = yield* apiClient;
        return yield* client.api.testMutation({ payload: "success" });
      }),
    staleTime: 1000,
  });

  const { data } = useEffectSuspenseQuery(queryOptions);

  const combinedAQueryOptions = effectQueryOptions({
    queryKey: ["combined", "a"] as const,
    queryFn: () => Effect.succeed({ value: 10 }),
  });

  const combinedBQueryOptions = effectQueryOptions({
    queryKey: ["combined", "b"] as const,
    queryFn: () => Effect.sleep("2 seconds").pipe(Effect.as({ value: 20 })),
  });

  const combinedQueries = useEffectQueries({
    queries: [combinedAQueryOptions, combinedBQueryOptions],
    combine: (results) => ({
      total: results.reduce((sum, r) => sum + (r.data?.value ?? 0), 0),
      isAllLoaded: results.every((r) => r.isSuccess),
      isAnyLoading: results.some((r) => r.isLoading),
    }),
  });

  return (
    <div>
      <h1>effect-react-query example</h1>

      <h2>Suspense Query</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>

      <h2>Mutation</h2>
      <button onClick={() => mutate("success")}>Fetch success</button>
      <button onClick={() => mutate("error")}>Fetch error</button>
      <button onClick={() => mutate("die")}>Fetch die</button>

      <h2>useEffectQueries</h2>
      <div>
        <div>Total: {combinedQueries.total}</div>
        <div>All loaded: {combinedQueries.isAllLoaded ? "Yes" : "No"}</div>
        <div>Any loading: {combinedQueries.isAnyLoading ? "Yes" : "No"}</div>
      </div>
    </div>
  );
}

export default App;
