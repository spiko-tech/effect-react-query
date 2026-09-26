import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi";

export const HelloResponse = Schema.Struct({
  message: Schema.String,
  method: Schema.String,
});

const mutationEndpoint = HttpApiEndpoint.put("testMutation", "/mutation-test", {
  payload: Schema.Literals(["success", "error", "die"]),
  success: HelloResponse,
  error: HttpApiError.BadRequest,
});

export const ApiGroup = HttpApiGroup.make("api").add(mutationEndpoint).prefix("/api");

export const Api = HttpApi.make("example-api").add(ApiGroup);
