import { serve } from "@hono/node-server";

import { createApp } from "./app.ts";
import { loadSettings, twilioConfigured } from "./config.ts";

const settings = loadSettings();
const app = createApp(settings);
const port = Number(process.env.PORT ?? 8000);

if (!twilioConfigured(settings)) {
  console.warn("Twilio is not configured: alerts will be logged, not sent.");
}

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.info(`SafeStep backend listening on http://localhost:${info.port}`);
});
