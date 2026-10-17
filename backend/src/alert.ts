export type Contact = { name: string; phone: string };

export type AlertRequest = {
  reason: "fall" | "manual";
  user_name: string | null;
  contacts: Contact[];
  location: { latitude: number; longitude: number; accuracy_m?: number } | null;
};

const E164 = /^\+[1-9]\d{7,14}$/;
const MAX_CONTACTS = 10;

export function parseAlertRequest(
  body: unknown
): { ok: true; value: AlertRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const b = (body ?? {}) as Record<string, unknown>;

  const reason = b.reason;
  if (reason !== "fall" && reason !== "manual") {
    errors.push('reason must be "fall" or "manual"');
  }

  let userName: string | null = null;
  if (b.user_name != null) {
    if (typeof b.user_name !== "string" || b.user_name.length > 80) {
      errors.push("user_name must be a string of at most 80 characters");
    } else {
      userName = b.user_name.trim() || null;
    }
  }

  const contacts: Contact[] = [];
  if (!Array.isArray(b.contacts) || b.contacts.length === 0) {
    errors.push("contacts must be a non-empty list");
  } else if (b.contacts.length > MAX_CONTACTS) {
    errors.push(`at most ${MAX_CONTACTS} contacts are allowed`);
  } else {
    b.contacts.forEach((raw, i) => {
      const c = (raw ?? {}) as Record<string, unknown>;
      const name = typeof c.name === "string" ? c.name.trim() : "";
      const phone = typeof c.phone === "string" ? c.phone.trim() : "";
      if (!name || name.length > 80) errors.push(`contacts[${i}].name is required`);
      if (!E164.test(phone)) {
        errors.push(`contacts[${i}].phone must be international format, e.g. +15195551234`);
      }
      contacts.push({ name, phone });
    });
  }

  let location: AlertRequest["location"] = null;
  if (b.location != null) {
    const l = b.location as Record<string, unknown>;
    const lat = l.latitude;
    const lng = l.longitude;
    if (
      typeof lat !== "number" || lat < -90 || lat > 90 ||
      typeof lng !== "number" || lng < -180 || lng > 180
    ) {
      errors.push("location must have a valid latitude and longitude");
    } else {
      location = { latitude: lat, longitude: lng };
      if (typeof l.accuracy_m === "number" && l.accuracy_m >= 0) {
        location.accuracy_m = l.accuracy_m;
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { reason: reason as AlertRequest["reason"], user_name: userName, contacts, location },
  };
}

export function buildMessage(alert: AlertRequest): string {
  const who = alert.user_name || "A SafeStep user";

  const opening =
    alert.reason === "fall"
      ? `SafeStep alert: ${who} may have fallen and did not respond. Please check on them now.`
      : `SafeStep alert: ${who} needs help. Please contact them as soon as you can.`;

  const where = alert.location
    ? `Location: https://maps.google.com/?q=${alert.location.latitude.toFixed(6)},${alert.location.longitude.toFixed(6)}`
    : "Location unavailable.";

  return `${opening}\n${where}`;
}
