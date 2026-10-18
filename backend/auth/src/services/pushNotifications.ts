
type EmergencyNotification = {
  token: string;
  incidentId: string;
  patientName: string;
  detectedAt: Date;
};

export async function sendEmergencyNotification({
  token,
  incidentId,
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
        sound: "emergency-alert.wav",
        priority: "high",
        interruptionLevel: "time-sensitive",
        categoryId: "FALL_EMERGENCY",
        data: {
          type: "fall_emergency",
          incidentId,
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
