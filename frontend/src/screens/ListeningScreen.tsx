import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mic, MicOff, X, AudioLines } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";

import { RADIUS, SPACING, TYPE } from "../constants/theme";
import { makeStyles, useTheme } from "../context/ThemeContext";

const EXAMPLES = ["“Find my water bottle”", "“What's around me?”", "“I need help”"];

export default function ListeningScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
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
        Animated.timing(pulse, { toValue: 1.18, duration: 850, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
      ]),
    );

    animation.start();

    return () => animation.stop();
  }, [isListening, pulse]);

  return (
    <SafeAreaView style={styles.container}>
      <Pressable
        style={styles.closeButton}
        accessibilityRole="button"
        accessibilityLabel="Close listening screen"
        onPress={() => navigation.goBack()}
      >
        <X color={colors.text} size={26} />
      </Pressable>

      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">
          {isListening ? "I'm listening…" : "Paused"}
        </Text>
        <Text style={styles.subtitle}>
          {isListening ? "Tell me what you need help with." : "Tap the microphone to start again."}
        </Text>

        <View style={styles.micContainer}>
          <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulse }] }]} />
          <Pressable
            style={styles.micButton}
            accessibilityRole="button"
            accessibilityLabel={isListening ? "Pause listening" : "Start listening"}
            onPress={() => setIsListening(!isListening)}
          >
            {isListening ? (
              <Mic size={52} color={colors.onPrimary} />
            ) : (
              <MicOff size={52} color={colors.onPrimary} />
            )}
          </Pressable>
        </View>

        <View style={styles.status}>
          <AudioLines size={22} color={isListening ? colors.success : colors.muted} />
          <Text style={[styles.statusText, { color: isListening ? colors.success : colors.muted }]}>
            {isListening ? "Listening" : "Microphone paused"}
          </Text>
        </View>

        <View style={styles.examples}>
          <Text style={styles.examplesTitle}>Try saying</Text>
          {EXAMPLES.map((e) => (
            <Text key={e} style={styles.example}>
              {e}
            </Text>
          ))}
        </View>
      </View>

      <Pressable
        style={styles.cancelButton}
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      paddingHorizontal: 20,
      paddingBottom: SPACING.md,
    },
    closeButton: {
      alignSelf: "flex-end",
      width: 52,
      height: 52,
      borderRadius: RADIUS.pill,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
      marginTop: SPACING.sm,
    },
    content: { flex: 1, alignItems: "center", justifyContent: "center" },
    title: { ...TYPE.headingXL, color: c.text, marginBottom: SPACING.sm, textAlign: "center" },
    subtitle: { ...TYPE.bodyL, color: c.muted, textAlign: "center" },
    micContainer: {
      width: 240,
      height: 240,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 40,
      marginBottom: SPACING.lg,
    },
    pulseRing: {
      position: "absolute",
      width: 200,
      height: 200,
      borderRadius: 100,
      backgroundColor: c.surface,
    },
    micButton: {
      width: 136,
      height: 136,
      borderRadius: 68,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    status: { flexDirection: "row", alignItems: "center", gap: 10 },
    statusText: TYPE.titleM,
    examples: {
      marginTop: 48,
      alignSelf: "stretch",
      backgroundColor: c.surface,
      borderRadius: RADIUS.xl,
      padding: 20,
      gap: 12,
    },
    examplesTitle: { ...TYPE.caption, color: c.muted, textTransform: "uppercase", letterSpacing: 1.5 },
    example: { ...TYPE.bodyL, color: c.text },
    cancelButton: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 58,
      borderRadius: RADIUS.pill,
      backgroundColor: c.surfaceAlt,
      marginTop: SPACING.md,
    },
    cancelText: { ...TYPE.titleM, color: c.text },
  }),
);
