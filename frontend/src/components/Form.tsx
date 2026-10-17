import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
} from "react-native";

import { COLORS, RADIUS, SPACING } from "../constants/theme";

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={COLORS.muted}
        accessibilityLabel={label}
        style={styles.input}
        {...props}
      />
    </>
  );
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
}) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
        { opacity: off ? 0.5 : pressed ? 0.75 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.text} />
      ) : (
        <Text style={[styles.buttonText, variant === "danger" && { color: COLORS.red }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <Text style={styles.error} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

export function LinkText({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Text style={styles.link} onPress={onPress} accessibilityRole="link">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    color: COLORS.muted,
    fontSize: 14,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    color: COLORS.text,
    fontSize: 17,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 30,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.lg,
  },
  secondary: {
    backgroundColor: COLORS.surfaceLight,
  },
  danger: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: COLORS.red,
  },
  buttonText: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "600",
  },
  error: {
    color: COLORS.red,
    fontSize: 14,
    marginTop: SPACING.md,
  },
  link: {
    color: COLORS.cyan,
    fontSize: 15,
    textAlign: "center",
    marginTop: SPACING.lg,
  },
});
