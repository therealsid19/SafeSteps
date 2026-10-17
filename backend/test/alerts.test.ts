import { beforeEach, describe, expect, it } from "vitest";

import { createApp, RateLimiter } from "../src/app.ts";
import type { Settings } from "../src/config.ts";

const CONTACTS = [
  { name: "Jeffrey", phone: "+19057363398" },
  { name: "Sam", phone: "+15195559876" },
];

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    apiKey: "test-key",
    twilioAccountSid: "AC123",
    twilioAuthToken: "secret",
    twilioFromNumber: "+15190000000",
    twilioMessagingServiceSid: "",
    alertsPerWindow: 5,
    rateWindowSeconds: 600,
    ...overrides,
  };
}

type Sent = { url: string; auth: string; form: Record<string, string> };
let sent: Sent[];

function fakeTwilio(status = 201): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(url),
      auth: new Headers(init?.headers).get("authorization") ?? "",
      form: Object.fromEntries(new URLSearchParams(String(init?.body))),
    });
    return status >= 400
      ? new Response(JSON.stringify({ message: "invalid number" }), { status })
      : new Response(JSON.stringify({ sid: "SM1" }), { status: 201 });
  }) as typeof fetch;
}

function client(s: Settings, status = 201) {
  const app = createApp(s, { fetch: fakeTwilio(status), rateLimiter: new RateLimiter() });
  return (payload: unknown, key: string | null = "test-key") =>
    app.request("/v1/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { "X-API-Key": key } : {}) },
      body: JSON.stringify(payload),
    });
}

beforeEach(() => {
  sent = [];
});

describe("POST /v1/alerts", () => {
  it("texts every contact with the name and location", async () => {
    const r = await client(settings())({
      reason: "fall",
      user_name: "Victoria",
      contacts: CONTACTS,
      location: { latitude: 43.4723, longitude: -80.5449 },
    });
    expect(r.status).toBe(200);
    expect((await r.json()).sent_count).toBe(2);
    expect(sent.map((s) => s.form.To).sort()).toEqual(["+15195559876", "+19057363398"]);
    expect(sent[0].form.Body).toContain("Victoria may have fallen");
    expect(sent[0].form.Body).toContain("maps.google.com/?q=43.472300,-80.544900");
    expect(sent[0].form.From).toBe("+15190000000");
    expect(sent[0].url).toContain("/Accounts/AC123/Messages.json");
    expect(sent[0].auth).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
  });

  it("handles a manual alert with no name or location", async () => {
    const r = await client(settings())({ reason: "manual", contacts: CONTACTS.slice(0, 1) });
    expect(r.status).toBe(200);
    expect(sent[0].form.Body).toContain("A SafeStep user needs help");
    expect(sent[0].form.Body).toContain("Location unavailable");
  });

  it("rejects a wrong or missing API key", async () => {
    const post = client(settings());
    expect((await post({ reason: "fall", contacts: CONTACTS }, "nope")).status).toBe(401);
    expect((await post({ reason: "fall", contacts: CONTACTS }, null)).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it("refuses to run open when Twilio is live", async () => {
    const r = await client(settings({ apiKey: "" }))({ reason: "fall", contacts: CONTACTS }, null);
    expect(r.status).toBe(500);
  });

  it("rejects bad phones, empty contacts and bad JSON", async () => {
    const post = client(settings());
    expect((await post({ reason: "fall", contacts: [{ name: "X", phone: "9057363398" }] })).status).toBe(422);
    expect((await post({ reason: "fall", contacts: [] })).status).toBe(422);
    expect((await post({ reason: "oops", contacts: CONTACTS })).status).toBe(422);
    expect(sent).toEqual([]);
  });

  it("simulates when Twilio isn't configured", async () => {
    const r = await client(settings({ twilioAccountSid: "", twilioAuthToken: "" }))({
      reason: "fall",
      contacts: CONTACTS,
    });
    const data = await r.json();
    expect(r.status).toBe(200);
    expect(data.simulated).toBe(true);
    expect(data.results.every((x: { status: string }) => x.status === "simulated")).toBe(true);
    expect(sent).toEqual([]);
  });

  it("returns 502 when no message could be sent", async () => {
    const r = await client(settings(), 400)({ reason: "fall", contacts: CONTACTS });
    expect(r.status).toBe(502);
  });

  it("texts a duplicate number only once", async () => {
    await client(settings())({ reason: "fall", contacts: [CONTACTS[0], CONTACTS[0]] });
    expect(sent.length).toBe(1);
  });

  it("rate limits repeated alerts", async () => {
    const post = client(settings({ alertsPerWindow: 2 }));
    const payload = { reason: "manual", contacts: CONTACTS.slice(0, 1) };
    expect((await post(payload)).status).toBe(200);
    expect((await post(payload)).status).toBe(200);
    expect((await post(payload)).status).toBe(429);
  });

  it("uses a Messaging Service when set", async () => {
    await client(settings({ twilioFromNumber: "", twilioMessagingServiceSid: "MG1" }))({
      reason: "fall",
      contacts: CONTACTS.slice(0, 1),
    });
    expect(sent[0].form.MessagingServiceSid).toBe("MG1");
    expect(sent[0].form.From).toBeUndefined();
  });
});
