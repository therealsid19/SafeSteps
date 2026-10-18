
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

type AlertStatus =
  | "preparing"
  | "listening"
  | "safe"
  | "escalated";

const RESPONSE_SECONDS = 10;

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

  const finish = useCallback(
    (outcome: "safe" | "help" | "timeout") => {
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

      // TODO: Replace with backend incident escalation.
      console.log("Fall escalation required:", {
        outcome,
        detectedAt: new Date().toISOString(),
      });
    },
    [navigation, stopListening]
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
    // The timeout still causes escalation.
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
            Say "I'm okay" or "I need help".
          </Text>

          {heard ? (
            <Text style={styles.heard}>Heard: {heard}</Text>
          ) : null}
        </>
      )}

      {status === "safe" && (
        <>
          <Text style={styles.title}>Glad you're okay</Text>
          <Text style={styles.description}>
            Your safety check has been cancelled.
          </Text>
        </>
      )}

      {status === "escalated" && (
        <>
          <Text style={styles.title}>Help requested</Text>
          <Text style={styles.description}>
            SafeStep detected that you may need assistance.
          </Text>
          <Text style={styles.warning}>
            Caregiver notification and calling are not connected yet.
          </Text>
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
    fontSize: 15,
    color: "#B91C1C",
    textAlign: "center",
  },
});
