import * as SMS from "expo-sms";
import * as Location from "expo-location";

import { normalizePhone } from "./phone";

export type EmergencyContact = { name: string; phone: string };

export type AlertReason = "fall" | "manual";

export type SendResult =
  | { ok: true; method: "automatic"; sentCount: number; simulated: boolean }
  | { ok: true; method: "composer"; status: "sent" | "unknown" }
  | { ok: false; error: "no-contacts" | "sms-unavailable" | "cancelled" };

const API_URL = process.env.EXPO_PUBLIC_SAFESTEP_API_URL?.replace(/\/$/, "");
const API_KEY = process.env.EXPO_PUBLIC_SAFESTEP_API_KEY ?? "";

type Coords = { latitude: number; longitude: number; accuracy_m?: number };

async function getLocation(): Promise<Coords | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;

    let position = await Location.getLastKnownPositionAsync({
      maxAge: 2 * 60 * 1000,
      requiredAccuracy: 200,
    });

    if (!position) {
      position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
    }
    if (!position) return null;

    const { latitude, longitude, accuracy } = position.coords;
    return {
      latitude,
      longitude,
      ...(accuracy != null ? { accuracy_m: accuracy } : {}),
    };
  } catch {
    return null;
  }
}

export function buildMessage(
  reason: AlertReason,
  userName: string,
  coords: Coords | null
): string {
  const name = userName.trim();
  const opening =
    reason === "fall"
      ? `SafeStep alert: ${name ? `This is ${name}. ` : ""}I may have fallen and didn't respond. Please check on me now.`
      : `SafeStep alert: ${name ? `This is ${name}. ` : ""}I need help. Please contact me as soon as you can.`;

  const where = coords
    ? `Location: https://maps.google.com/?q=${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`
    : "Location unavailable.";

  return `${opening}\n${where}`;
}

async function sendViaServer(
  contacts: EmergencyContact[],
  reason: AlertReason,
  userName: string,
  coords: Coords | null
): Promise<SendResult | null> {
  if (!API_URL) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const resp = await fetch(`${API_URL}/v1/alerts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { "X-API-Key": API_KEY } : {}),
      },
      body: JSON.stringify({
        reason,
        user_name: userName.trim() || null,
        contacts: contacts.map((c) => ({ name: c.name, phone: c.phone })),
        location: coords,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    return {
      ok: true,
      method: "automatic",
      sentCount: data.sent_count ?? 0,
      simulated: Boolean(data.simulated),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendEmergencyAlert(
  contacts: EmergencyContact[],
  reason: AlertReason,
  userName: string
): Promise<SendResult> {
  contacts = contacts
    .map((c) => ({ ...c, phone: normalizePhone(c.phone) ?? "" }))
    .filter((c, i, all) => c.phone && all.findIndex((x) => x.phone === c.phone) === i);
  if (contacts.length === 0) return { ok: false, error: "no-contacts" };

  const coords = await getLocation();

  const automatic = await sendViaServer(contacts, reason, userName, coords);
  if (automatic) return automatic;

  const available = await SMS.isAvailableAsync();
  if (!available) return { ok: false, error: "sms-unavailable" };

  const { result } = await SMS.sendSMSAsync(
    contacts.map((c) => c.phone),
    buildMessage(reason, userName, coords)
  );

  if (result === "cancelled") return { ok: false, error: "cancelled" };
  return { ok: true, method: "composer", status: result };
}
