
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { auth } from "./auth";
import { env } from "./config/env";
import { me } from "./routes/me";
import { location } from "./routes/location";

const app = new Hono();

app.use(logger());

// Allow the Expo web frontend to call the backend.
app.use(
  "*",
  cors({
    origin: env.TRUSTED_ORIGINS,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    credentials: true,
  }),
);

// Better Auth authentication endpoints
app.on(["GET", "POST"], "/api/auth/*", (c) =>
  auth.handler(c.req.raw)
);

// Application routes
app.route("/me", me);
app.route("/location", location);

app.get("/", (c) => c.text("SafeStep API"));

export default {
  port: env.PORT,
  fetch: app.fetch,
};
