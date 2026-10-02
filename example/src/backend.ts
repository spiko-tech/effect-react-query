import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Effect, Layer, Match } from "effect";
import { HttpRouter } from "effect/http";
import { HttpApiBuilder, HttpApiError } from "effect/http-api";
import { Api } from "./api";

export const ApiGroupLive = HttpApiBuilder.group(Api, "api", (handlers) =>
  handlers.handle("testMutation", ({ payload }) =>
    Match.value(payload).pipe(
      Match.when("success", () =>
        Effect.succeed({
          message: "Hello, world!",
          method: "GET",
        }),
      ),
      Match.when("error", () => Effect.fail(new HttpApiError.BadRequest())),
      Match.when("die", Effect.die),
      Match.exhaustive,
    ),
  ),
);

const ApiLive = HttpApiBuilder.layer(Api).pipe(Layer.provide(ApiGroupLive));

const ServerLive = HttpRouter.serve(
  Layer.mergeAll(ApiLive, HttpRouter.cors({ allowedOrigins: ["http://localhost:3200"] })),
).pipe(Layer.provide(BunHttpServer.layer({ port: 3000 })));

BunRuntime.runMain(Layer.launch(ServerLive));
