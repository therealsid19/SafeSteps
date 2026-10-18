import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { RADIUS, SPACING, TYPE } from "../constants/theme";
import { makeStyles, useTheme } from "../context/ThemeContext";

type Props = {
  title: string;
  hint: string;
  icon: LucideIcon;
  /** "card" = cream card, "accent" = coral (for getting help) */
  tone?: "card" | "accent";
  onPress: () => void;
};

/** One of the two huge stacked actions on the patient home screen. The whole card is the button. */
export default function BigAction({ title, hint, icon: Icon, tone = "card", onPress }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const fg = tone === "accent" ? colors.onAccent : colors.onCard;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: tone === "accent" ? colors.accent : colors.card },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.badge}>
        <Icon size={40} color={fg} strokeWidth={2} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: fg }]}>{title}</Text>
        <Text style={[styles.hint, { color: fg }]}>{hint}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    card: {
      flex: 1,
      minHeight: 180,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.md,
    },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    badge: {
      width: 84,
      height: 84,
      borderRadius: RADIUS.pill,
      backgroundColor: "rgba(0,0,0,0.08)",
      alignItems: "center",
      justifyContent: "center",
    },
    text: { alignItems: "center", gap: SPACING.xs },
    title: { ...TYPE.headingM, textAlign: "center" },
    hint: { ...TYPE.bodyL, textAlign: "center", opacity: 0.7 },
  }),
);
