import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

/** Android channel for fall alerts. The backend sends pushes with this channelId. */
export const FALL_CHANNEL_ID = "fall_alerts";

/** `data` the backend attaches to a fall push (backend/auth/src/services/pushNotifications.ts). */
export type FallPushData = {
  type: "fall_emergency";
  incidentId: string;
  patientId: string;
  patientName?: string;
  detectedAt: string;
};

export function isFallPush(data: unknown): data is FallPushData {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "fall_emergency"
  );
}

// Without a handler, pushes that arrive while the app is open are not shown at all.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureFallChannel() {
  if (Platform.OS !== "android") return;
  // Must exist before asking for permission: Android 13+ only prompts once a channel exists.
  await Notifications.setNotificationChannelAsync(FALL_CHANNEL_ID, {
    name: "Fall alerts",
    description: "Alerts when someone you look after may have fallen",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 500, 250, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
}

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: string };

/**
 * Asks for notification permission and returns this phone's Expo push token.
 * Never throws: a caretaker who can't get pushes still needs the rest of the app.
 */
export async function getPushToken(): Promise<PushRegistration> {
  if (Platform.OS === "web") return { ok: false, reason: "Push notifications need the phone app" };

  const projectId: string | undefined =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    return { ok: false, reason: "No EAS projectId in app.json (run `bunx eas-cli init`)" };
  }

  try {
    await ensureFallChannel();

    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
    if (!granted) return { ok: false, reason: "Notifications are turned off for SafeStep" };

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: data };
  } catch (e) {
    // getExpoPushTokenAsync needs the network and a development build (not Expo Go on Android)
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
