import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";

import { type Settings, twilioConfigured } from "./config.ts";
import { buildMessage, parseAlertRequest } from "./alert.ts";
import { sendSms } from "./twilio.ts";

type ContactResult = {
  name: string;
  phone: string;
  status: "sent" | "failed" | "simulated";
  error: string | null;
};

export class RateLimiter {
  private hits = new Map<string, number[]>();

  allow(key: string, limit: number, windowSeconds: number, now = Date.now()): boolean {
    const cutoff = now - windowSeconds * 1000;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function callerKey(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || c.req.header("x-real-ip") || c.req.header("x-api-key") || "unknown";
}

export function createApp(
  settings: Settings,
  deps: { fetch?: typeof fetch; rateLimiter?: RateLimiter } = {}
) {
  const app = new Hono();
  const limiter = deps.rateLimiter ?? new RateLimiter();
  const live = twilioConfigured(settings);

  app.get("/health", (c) => c.json({ ok: true, sms: live ? "twilio" : "simulated" }));

  app.post("/v1/alerts", async (c) => {
    if (!settings.apiKey) {
      if (live) return c.json({ detail: "Server is missing SAFESTEP_API_KEY." }, 500);
    } else {
      const key = c.req.header("x-api-key") ?? "";
      if (!key || !safeEqual(key, settings.apiKey)) {
        return c.json({ detail: "Invalid or missing API key." }, 401);
      }
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ detail: ["body must be JSON"] }, 422);
    }
    const parsed = parseAlertRequest(body);
    if (!parsed.ok) return c.json({ detail: parsed.errors }, 422);
    const alert = parsed.value;

    if (!limiter.allow(callerKey(c), settings.alertsPerWindow, settings.rateWindowSeconds)) {
      return c.json({ detail: "Too many alerts. Please wait before trying again." }, 429);
    }

    const message = buildMessage(alert);
    const contacts = [...new Map(alert.contacts.map((ct) => [ct.phone, ct])).values()];

    if (!live) {
      for (const ct of contacts) {
        console.info(`[simulated SMS] to ${ct.name} (${ct.phone}): ${message}`);
      }
      return c.json({
        sent_count: 0,
        simulated: true,
        results: contacts.map<ContactResult>((ct) => ({ ...ct, status: "simulated", error: null })),
      });
    }

    const errors = await Promise.all(
      contacts.map((ct) => sendSms(settings, ct.phone, message, deps.fetch))
    );
    const results = contacts.map<ContactResult>((ct, i) => ({
      ...ct,
      status: errors[i] ? "failed" : "sent",
      error: errors[i],
    }));
    const sent = results.filter((r) => r.status === "sent").length;
    console.info(`Alert (${alert.reason}) sent to ${sent} of ${results.length} contacts`);

    if (sent === 0) return c.json({ detail: "No messages could be sent.", results }, 502);
    return c.json({ sent_count: sent, simulated: false, results });
  });

  return app;
}
