import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { fallSmsBody, sendFallSms, smsEnabled, toE164 } from "./sms";

describe("toE164", () => {
  test("keeps numbers that already have a country code", () => {
    expect(toE164("+1 (555) 123-4567")).toBe("+15551234567");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
  });
  test("treats 10 digits, or 11 starting with 1, as US/Canada", () => {
    expect(toE164("555-123-4567")).toBe("+15551234567");
    expect(toE164("1 555 123 4567")).toBe("+15551234567");
  });
  test("refuses what can't be a phone number", () => {
    expect(toE164(null)).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164("12345")).toBeNull();
    expect(toE164("020 7946 0958")).toBeNull(); // no country code, not 10 digits
  });
});

describe("fallSmsBody", () => {
  test("says possible fall and the first name only (spec, Privacy)", () => {
    expect(fallSmsBody("Ada Lovelace", "help")).toBe(
      "SafeStep: possible fall. Ada asked for help. Check on them now, or open SafeStep to call.",
    );
    expect(fallSmsBody("Ada", "timeout")).toBe(
      "SafeStep: possible fall. Ada didn't answer the safety check. Check on them now, or open SafeStep to call.",
    );
  });
});

describe("sendFallSms", () => {
  const realFetch = globalThis.fetch;
  const saved = { ...process.env };
  let requests: { url: string; init: RequestInit }[] = [];

  function stubTwilio(response: unknown, status = 201) {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init! });
      return new Response(JSON.stringify(response), { status });
    }) as typeof fetch;
  }

  beforeEach(() => {
    requests = [];
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM_NUMBER = "+15550001111";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"]) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const input = {
    to: "+15551234567",
    patientName: "Ada",
    reason: "help" as const,
  };

  test("posts the text to Twilio with basic auth and returns the SID", async () => {
    stubTwilio({ sid: "SM1" });

    expect(await sendFallSms(input)).toBe("SM1");

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    const headers = requests[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${btoa("AC123:secret")}`);
    const form = new URLSearchParams(String(requests[0].init.body));
    expect(form.get("To")).toBe("+15551234567");
    expect(form.get("From")).toBe("+15550001111");
    expect(form.get("Body")).toContain("possible fall. Ada asked for help");
  });

  test("throws with Twilio's reason when it refuses, without the phone number", async () => {
    stubTwilio({ code: 21608, message: "The number +1 555-123-4567 is unverified" }, 400);
    const error = await sendFallSms(input).catch((e: Error) => e);
    expect(String(error)).toContain("code 21608");
    expect(String(error)).toContain("The number [number] is unverified");
    expect(String(error)).not.toContain("4567");
  });

  test("is off, and refuses to send, without all three variables", async () => {
    delete process.env.TWILIO_FROM_NUMBER;
    expect(smsEnabled()).toBe(false);
    await expect(sendFallSms(input)).rejects.toThrow("not configured");
  });
});
