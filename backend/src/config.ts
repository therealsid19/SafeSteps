import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type Settings = {
  apiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFromNumber: string;
  twilioMessagingServiceSid: string;
  alertsPerWindow: number;
  rateWindowSeconds: number;
};

export function twilioConfigured(s: Settings): boolean {
  return Boolean(
    s.twilioAccountSid &&
      s.twilioAuthToken &&
      (s.twilioFromNumber || s.twilioMessagingServiceSid)
  );
}

function loadDotenv(): void {
  const path = fileURLToPath(new URL("../.env", import.meta.url));
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function loadSettings(): Settings {
  loadDotenv();
  const env = process.env;
  return {
    apiKey: env.SAFESTEP_API_KEY ?? "",
    twilioAccountSid: env.TWILIO_ACCOUNT_SID ?? "",
    twilioAuthToken: env.TWILIO_AUTH_TOKEN ?? "",
    twilioFromNumber: env.TWILIO_FROM_NUMBER ?? "",
    twilioMessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID ?? "",
    alertsPerWindow: Number(env.ALERTS_PER_WINDOW ?? 5),
    rateWindowSeconds: Number(env.RATE_WINDOW_SECONDS ?? 600),
  };
}
