import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { auth } from "./auth";
import { env } from "./config/env";
import { me } from "./routes/me";

const app = new Hono();

app.use(logger());
// Lets the Expo app running in a browser call the API (the phone app doesn't need CORS)
app.use(
  "*",
  cors({
    origin: env.TRUSTED_ORIGINS,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

// Better Auth: sign in with Google, sessions, sign out, ...
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/me", me);

app.get("/", (c) => c.text("SafeStep API"));

export default {
  port: env.PORT,
  fetch: app.fetch,
};
