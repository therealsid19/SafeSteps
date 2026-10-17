import type { Settings } from "./config.ts";

const TWILIO_URL = (sid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

export async function sendSms(
  settings: Settings,
  to: string,
  body: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const form = new URLSearchParams({ To: to, Body: body });
  if (settings.twilioMessagingServiceSid) {
    form.set("MessagingServiceSid", settings.twilioMessagingServiceSid);
  } else {
    form.set("From", settings.twilioFromNumber);
  }

  const auth = Buffer.from(
    `${settings.twilioAccountSid}:${settings.twilioAuthToken}`
  ).toString("base64");

  let resp: Response;
  try {
    resp = await fetchImpl(TWILIO_URL(settings.twilioAccountSid), {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.warn(`Twilio request to ${to} failed:`, err);
    return "Could not reach the SMS provider.";
  }

  if (resp.ok) return null;

  let detail = await resp.text();
  try {
    detail = JSON.parse(detail).message ?? detail;
  } catch {
  }
  console.warn(`Twilio rejected message to ${to}: ${detail}`);
  return String(detail).slice(0, 200);
}
