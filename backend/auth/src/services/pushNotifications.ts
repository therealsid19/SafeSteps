import { firstName } from "./sms";


type EmergencyNotification = {
  token: string;
  incidentId: string;
  patientId: string;
  reason: "timeout" | "help" | "voice_error";
  patientName: string;
  detectedAt: Date;
};

export async function sendEmergencyNotification({
  token,
  incidentId,
  patientId,
  patientName,
  reason,
  detectedAt,
}: EmergencyNotification): Promise<void> {
  const response = await fetch(
    "https://exp.host/--/api/v2/push/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // Don't let a hung Expo request keep the patient waiting
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        to: token,
        title: "SafeStep: possible fall",
        // First name only (spec, Privacy); the alert screen shows the rest after sign-in
        body: `${firstName(patientName)} may need help. Check on them now.`,
        sound: "default",
        // Android: the high-importance channel the app creates (frontend/src/lib/notifications.ts)
        channelId: "fall-alerts",
        priority: "high",
        interruptionLevel: "time-sensitive",
        categoryId: "FALL_EMERGENCY",
        data: {
          type: "fall_emergency",
          incidentId,
          patientId,
          patientName: firstName(patientName),
          reason,
          detectedAt: detectedAt.toISOString(),
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Expo push request failed: ${response.status}`,
    );
  }

  const result = await response.json() as {
    data?: {
      status: string;
      message?: string;
      id?: string;
    };
  };

  if (result.data?.status !== "ok") {
    throw new Error(
      result.data?.message ?? "Expo rejected the push notification",
    );
  }
}
