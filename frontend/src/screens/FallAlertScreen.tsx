
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import { useProfile } from "../context/ProfileContext";
import { ApiError, useApi } from "../lib/api";

type AlertStatus =
  | "preparing"
  | "listening"
  | "safe"
  | "escalated";

const RESPONSE_SECONDS = 10;

type Outcome = "safe" | "help" | "timeout" | "voice_error";

/** What happened to the caretaker alert, shown to the patient. */
type Delivery =
  | { state: "sending" }
  | { state: "sent" }
  | { state: "not_sent"; message: string };

type EscalateResponse = { incidentId: string; alertStatus: "sent" | "failed"; detail?: string };

// Waits between attempts when the server can't be reached or errors (not for 4xx answers)
const RETRY_DELAYS_MS = [2000, 5000, 10000];

function classifyResponse(text: string): "safe" | "help" | null {
  const normalized = text.toLowerCase().replace(/[^\w\s']/g, " ");

  // Check requests for help before positive responses.
  if (
    /\b(help|emergency|ambulance|hurt|injured|can't get up|cannot get up|not okay|not fine)\b/.test(
      normalized
    )
  ) {
    return "help";
  }

  if (
    /\b(i am okay|i'm okay|i am ok|i'm ok|i am fine|i'm fine|i'm alright|i am alright|yes i'm okay)\b/.test(
      normalized
    )
  ) {
    return "safe";
  }

  return null;
}

export default function FallAlertScreen() {
  const navigation = useNavigation();
  const [status, setStatus] = useState<AlertStatus>("preparing");
  const [secondsLeft, setSecondsLeft] = useState(RESPONSE_SECONDS);
  const [heard, setHeard] = useState("");
  const [delivery, setDelivery] = useState<Delivery>({ state: "sending" });
  const api = useApi();
  const { partner } = useProfile();
  const caretakerPhone = partner?.phone_number?.replace(/[^\d+]/g, "");

  // When the fall was detected, not when the check finished
  const detectedAt = useRef(new Date().toISOString());

  const completed = useRef(false);
  const deadline = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopListening = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }

    Speech.stop();

    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Recognition may not have started.
    }
  }, []);

  const escalate = useCallback(
    async (reason: Exclude<Outcome, "safe">) => {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await api<EscalateResponse>("POST", "/falls/escalate", {
            reason,
            detectedAt: detectedAt.current,
          });
          setDelivery(
            res.alertStatus === "sent"
              ? { state: "sent" }
              : { state: "not_sent", message: res.detail ?? "Your caregiver could not be notified." },
          );
          return;
        } catch (e) {
          // 4xx: retrying won't help (e.g. 409 no caregiver linked)
          const final =
            (e instanceof ApiError && e.status >= 400 && e.status < 500) ||
            attempt >= RETRY_DELAYS_MS.length;
          if (final) {
            setDelivery({
              state: "not_sent",
              message: e instanceof Error ? e.message : "Your caregiver could not be notified.",
            });
            return;
          }
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        }
      }
    },
    [api],
  );

  const finish = useCallback(
    (outcome: Outcome) => {
      if (completed.current) return;
      completed.current = true;

      stopListening();

      if (outcome === "safe") {
        setStatus("safe");
        setTimeout(() => {
          if (navigation.canGoBack()) navigation.goBack();
        }, 1200);
        return;
      }

      setStatus("escalated");
      escalate(outcome);
    },
    [navigation, stopListening, escalate]
  );

  useSpeechRecognitionEvent("result", (event) => {
    if (completed.current || !deadline.current) return;

    const transcript = event.results[0]?.transcript ?? "";
    setHeard(transcript);

    const response = classifyResponse(transcript);

    // Require a final recognition result before accepting "I'm okay".
    if (response === "safe" && event.isFinal) {
      finish("safe");
    } else if (response === "help") {
      finish("help");
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (completed.current) return;
    console.warn("Speech recognition error:", event.error);
    // After listening started, the countdown still escalates. Before that there is no
    // countdown, so escalate now or the alert would never go out.
    if (!deadline.current) finish("voice_error");
  });

  useEffect(() => {
    let mounted = true;

    async function begin() {
      try {
        const permissions =
          await ExpoSpeechRecognitionModule.requestPermissionsAsync();

        if (!mounted) return;

        if (!permissions.granted) {
          finish("help");
          return;
        }

        // Speak first to avoid recognizing SafeStep's own voice.
        await new Promise<void>((resolve) => {
          Speech.speak(
            "A possible fall was detected. Are you okay? Please tell me if you are okay or need help.",
            {
              language: "en-US",
              onDone: resolve,
              onStopped: resolve,
              onError: () => resolve(),
            }
          );
        });

        if (!mounted || completed.current) return;

        ExpoSpeechRecognitionModule.start({
          lang: "en-US",
          interimResults: true,
          continuous: true,
        });
      } catch (error) {
        console.error("Unable to start safety check:", error);
        if (mounted) finish("help");
      }
    }

    begin();

    return () => {
      mounted = false;
      completed.current = true;
      stopListening();
    };
  }, [finish, stopListening]);

  useSpeechRecognitionEvent("start", () => {
    if (completed.current || deadline.current) return;

    setStatus("listening");
    deadline.current = Date.now() + RESPONSE_SECONDS * 1000;

    timer.current = setInterval(() => {
      if (!deadline.current || completed.current) return;

      const remaining = Math.max(
        0,
        Math.ceil((deadline.current - Date.now()) / 1000)
      );

      setSecondsLeft(remaining);

      if (remaining === 0) {
        finish("timeout");
      }
    }, 100);
  });

  return (
    <View style={styles.container}>
      {status === "preparing" && (
        <>
          <Text style={styles.title}>Possible fall detected</Text>
          <Text style={styles.description}>
            Preparing your voice safety check...
          </Text>
        </>
      )}

      {status === "listening" && (
        <>
          <Text style={styles.title}>Are you okay?</Text>
          <Text style={styles.description}>
            We detected a possible fall.
          </Text>

          <Text style={styles.timer}>
            00:{String(secondsLeft).padStart(2, "0")}
          </Text>

          <Text style={styles.listening}>Microphone is listening...</Text>
          <Text style={styles.instructions}>
            {`Say "I'm okay" or "I need help".`}
          </Text>

          {heard ? (
            <Text style={styles.heard}>Heard: {heard}</Text>
          ) : null}
        </>
      )}

      {status === "safe" && (
        <>
          <Text style={styles.title}>{"Glad you're okay"}</Text>
          <Text style={styles.description}>
            Your safety check has been cancelled.
          </Text>
        </>
      )}

      {status === "escalated" && (
        <>
          <Text style={styles.title}>Help requested</Text>
          {delivery.state === "sending" && (
            <Text style={styles.description}>Notifying your caregiver...</Text>
          )}
          {delivery.state === "sent" && (
            <Text style={styles.description}>
              Your caregiver has been notified.
            </Text>
          )}
          {delivery.state === "not_sent" && (
            <>
              <Text style={styles.warning}>{delivery.message}</Text>
              <Text style={styles.description}>Please call someone for help.</Text>
            </>
          )}

          {caretakerPhone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${partner?.name ?? "your caregiver"}`}
              onPress={() => Linking.openURL(`tel:${caretakerPhone}`)}
              style={({ pressed }) => [styles.callButton, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.callText}>Call {partner?.name ?? "caregiver"}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF8ED",
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#78350F",
    textAlign: "center",
    marginBottom: 16,
  },
  description: {
    fontSize: 18,
    color: "#92400E",
    textAlign: "center",
    marginBottom: 24,
  },
  timer: {
    fontSize: 72,
    fontWeight: "800",
    color: "#B91C1C",
    marginVertical: 24,
  },
  listening: {
    fontSize: 19,
    fontWeight: "600",
    color: "#1D4ED8",
    marginBottom: 12,
  },
  instructions: {
    fontSize: 18,
    color: "#78350F",
    textAlign: "center",
  },
  heard: {
    marginTop: 24,
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
  },
  warning: {
    marginTop: 20,
    marginBottom: 12,
    fontSize: 17,
    fontWeight: "600",
    color: "#B91C1C",
    textAlign: "center",
  },
  callButton: {
    marginTop: 12,
    backgroundColor: "#B91C1C",
    borderRadius: 999,
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignSelf: "stretch",
    alignItems: "center",
  },
  callText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
