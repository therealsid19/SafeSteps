
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
} from "react-native";
import { Mic, X, AudioLines } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { COLORS } from "../constants/theme";

export default function ListeningScreen() {
  const navigation = useNavigation();
  const [isListening, setIsListening] = useState(true);

  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isListening) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.18,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => animation.stop();
  }, [isListening, pulse]);

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.closeButton}
        accessibilityRole="button"
        accessibilityLabel="Close listening screen"
        onPress={() => navigation.goBack()}
      >
        <X color={COLORS.text} size={26} />
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title}>
          {isListening ? "I'm listening..." : "Paused"}
        </Text>

        <Text style={styles.subtitle}>
          {isListening
            ? "Tell me what you need help with."
            : "Tap the microphone to start again."}
        </Text>

        <View style={styles.micContainer}>
          <Animated.View
            style={[
              styles.pulseRing,
              { transform: [{ scale: pulse }] },
            ]}
          />

          <Pressable
            style={styles.micButton}
            accessibilityRole="button"
            accessibilityLabel={
              isListening ? "Pause listening" : "Start listening"
            }
            onPress={() => setIsListening(!isListening)}
          >
            <Mic size={48} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.status}>
          <AudioLines size={22} color={COLORS.cyan} />
          <Text style={styles.statusText}>
            {isListening ? "Listening" : "Microphone paused"}
          </Text>
        </View>

        <View style={styles.examples}>
          <Text style={styles.examplesTitle}>
            TRY SAYING
          </Text>

          <Text style={styles.example}>
            "Find my water bottle"
          </Text>
          <Text style={styles.example}>
            "What's around me?"
          </Text>
          <Text style={styles.example}>
            "I need help"
          </Text>
        </View>
      </View>

      <Pressable
        style={styles.cancelButton}
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 24,
    paddingTop: 35,
    paddingBottom: 40,
  },
  closeButton: {
    alignSelf: "flex-end",
    padding: 10,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 12,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 16,
    textAlign: "center",
  },
  micContainer: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 50,
    marginBottom: 28,
  },
  pulseRing: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: "#203C82",
    opacity: 0.45,
  },
  micButton: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  statusText: {
    color: COLORS.cyan,
    fontSize: 16,
    fontWeight: "600",
  },
  examples: {
    marginTop: 65,
    alignItems: "center",
    gap: 14,
  },
  examplesTitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
  },
  example: {
    color: COLORS.text,
    fontSize: 16,
  },
  cancelButton: {
    alignItems: "center",
    padding: 16,
  },
  cancelText: {
    color: COLORS.muted,
    fontSize: 17,
  },
});