import { Effect } from "effect";
import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { Api } from "./api.js";

export const apiClient = HttpApiClient.make(Api, {
  baseUrl: "http://localhost:3000",
}).pipe(Effect.provide(FetchHttpClient.layer));
