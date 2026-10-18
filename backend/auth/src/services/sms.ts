// Fall alert texts through Twilio's Messages API (no SDK; it's one POST).
// Off unless TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are set.

type FallReason = "timeout" | "help" | "voice_error";

type TwilioConfig = { accountSid: string; authToken: string; from: string };

/** Read at call time so tests and a Railway variable change don't need a restart of this module. */
function twilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  return accountSid && authToken && from
    ? { accountSid, authToken, from }
    : null;
}

export const smsEnabled = () => twilioConfig() !== null;

/**
 * A stored phone number in E.164 (+15551234567), or null if it can't be one.
 * Numbers are typed freely; a bare 10-digit number is taken as US/Canada.
 */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+"))
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

const WHAT_HAPPENED: Record<FallReason, string> = {
  timeout: "didn't answer the safety check",
  help: "asked for help",
  voice_error: "couldn't complete the safety check",
};

export function fallSmsBody(
  patientName: string,
  reason: FallReason,
  patientPhone: string | null,
) {
  const call = patientPhone
    ? ` Call them now: ${patientPhone}`
    : " Check on them now.";
  return `SafeStep alert: ${patientName} may have fallen and ${WHAT_HAPPENED[reason]}.${call}`;
}

type FallSms = {
  to: string;
  patientName: string;
  patientPhone: string | null;
  reason: FallReason;
};

/** Sends the fall text. Returns Twilio's message SID; throws if Twilio refuses it. */
export async function sendFallSms({
  to,
  patientName,
  patientPhone,
  reason,
}: FallSms): Promise<string> {
  const config = twilioConfig();
  if (!config) throw new Error("Twilio is not configured");

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: config.from,
        Body: fallSmsBody(patientName, reason, patientPhone),
      }),
    },
  );

  const result = (await response.json().catch(() => ({}))) as {
    sid?: string;
    code?: number;
    message?: string;
  };

  if (!response.ok || !result.sid) {
    // e.g. 21608: a trial account can only text verified numbers
    throw new Error(
      `Twilio refused the text (${response.status}${result.code ? `, code ${result.code}` : ""}): ${
        result.message ?? "no message"
      }`,
    );
  }

  return result.sid;
}
