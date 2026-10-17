import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { RADIUS, SPACING, TYPE } from "../constants/theme";
import { makeStyles, useTheme } from "../context/ThemeContext";

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        style={styles.input}
        {...props}
      />
    </>
  );
}

type Variant = "primary" | "secondary" | "accent" | "danger";

export function Button({
  title,
  onPress,
  loading,
  disabled,
  icon: Icon,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  variant?: Variant;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const off = disabled || loading;
  const fg = {
    primary: colors.onPrimary,
    secondary: colors.text,
    accent: colors.onAccent,
    danger: colors.danger,
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        { opacity: off ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {Icon ? <Icon size={22} color={fg} strokeWidth={2} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  const styles = useStyles();
  if (!children) return null;
  return (
    <Text style={styles.error} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

export function LinkText({ children, onPress }: { children: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Text style={styles.link} onPress={onPress} accessibilityRole="link">
      {children}
    </Text>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    label: {
      ...TYPE.bodyM,
      color: c.muted,
      marginBottom: SPACING.sm,
      marginTop: SPACING.md,
    },
    input: {
      ...TYPE.bodyL,
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      color: c.text,
      paddingHorizontal: 18,
      minHeight: 56,
    },
    button: {
      borderRadius: RADIUS.pill,
      minHeight: 58,
      paddingHorizontal: 24,
      alignItems: "center",
      justifyContent: "center",
      marginTop: SPACING.lg,
    },
    buttonInner: { flexDirection: "row", alignItems: "center", gap: 10 },
    primary: { backgroundColor: c.primary },
    secondary: { backgroundColor: c.surfaceAlt },
    accent: { backgroundColor: c.accent },
    danger: { backgroundColor: c.dangerSurface },
    buttonText: TYPE.titleM,
    error: {
      ...TYPE.bodyM,
      color: c.danger,
      marginTop: SPACING.md,
    },
    link: {
      ...TYPE.titleM,
      color: c.muted,
      textAlign: "center",
      textDecorationLine: "underline",
      marginTop: SPACING.lg,
      paddingVertical: SPACING.sm,
    },
  }),
);
