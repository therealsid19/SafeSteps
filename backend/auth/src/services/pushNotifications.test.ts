import { afterEach, describe, expect, mock, test } from "bun:test";

import { sendEmergencyNotification } from "./pushNotifications";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubExpo(response: unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(response), { status });
  }) as unknown as typeof fetch;
  return calls;
}

const input = {
  token: "ExponentPushToken[abc]",
  incidentId: "inc-1",
  patientId: "patient-1",
  patientName: "Ada",
  detectedAt: new Date("2026-10-18T09:00:00.000Z"),
};

describe("sendEmergencyNotification", () => {
  test("sends what the app's alert screen and Android channel expect", async () => {
    const calls = stubExpo({ data: { status: "ok", id: "ticket-1" } });

    await sendEmergencyNotification(input);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://exp.host/--/api/v2/push/send");
    const body = calls[0].body;
    expect(body.to).toBe("ExponentPushToken[abc]");
    expect(body.priority).toBe("high");
    // Must match FALL_CHANNEL_ID in frontend/src/lib/notifications.ts
    expect(body.channelId).toBe("fall_alerts");
    // A custom sound file that isn't bundled in the app plays nothing on some devices
    expect(body.sound).toBe("default");
    // Must match FallPushData in frontend/src/lib/notifications.ts
    expect(body.data).toEqual({
      type: "fall_emergency",
      incidentId: "inc-1",
      patientId: "patient-1",
      patientName: "Ada",
      detectedAt: "2026-10-18T09:00:00.000Z",
    });
  });

  test("throws when Expo rejects the ticket, so the incident is marked failed", async () => {
    stubExpo({ data: { status: "error", message: "DeviceNotRegistered" } });
    await expect(sendEmergencyNotification(input)).rejects.toThrow("DeviceNotRegistered");
  });

  test("throws on an HTTP error from Expo", async () => {
    stubExpo({}, 500);
    await expect(sendEmergencyNotification(input)).rejects.toThrow("500");
  });
});
