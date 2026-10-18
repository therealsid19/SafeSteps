
type EmergencyNotification = {
  token: string;
  incidentId: string;
  patientId: string;
  patientName: string;
  detectedAt: Date;
};

export async function sendEmergencyNotification({
  token,
  incidentId,
  patientId,
  patientName,
  detectedAt,
}: EmergencyNotification): Promise<void> {
  const response = await fetch(
    "https://exp.host/--/api/v2/push/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        title: "🚨 SafeStep Emergency",
        body: `${patientName} may have fallen at ${detectedAt.toISOString()} (UTC). Please check on them immediately.`,
        sound: "default",
        // Android: the high-importance channel the app creates (frontend/src/lib/notifications.ts)
        channelId: "fall-alerts",
        // Spec: an alert older than 5 minutes is stale; the caretaker will have been told otherwise
        ttl: 300,
        priority: "high",
        interruptionLevel: "time-sensitive",
        categoryId: "FALL_EMERGENCY",
        data: {
          type: "fall_emergency",
          incidentId,
          patientId,
          patientName,
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
