import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, HeartHandshake, User as UserIcon } from "lucide-react-native";

import { Button, ErrorText, Field, LinkText } from "../components/Form";
import { RADIUS, SPACING, TYPE } from "../constants/theme";
import { useProfile } from "../context/ProfileContext";
import { makeStyles, useTheme } from "../context/ThemeContext";
import { authClient } from "../lib/auth-client";
import type { Role } from "../lib/api";

const OPTIONS: { role: Role; title: string; description: string; icon: typeof UserIcon }[] = [
  {
    role: "patient",
    title: "I'm a patient",
    description: "I'll use SafeStep to get around and find things.",
    icon: UserIcon,
  },
  {
    role: "caretaker",
    title: "I'm a caretaker",
    description: "I support someone who uses SafeStep.",
    icon: HeartHandshake,
  },
];

/** Shown once, right after the first sign-in. */
export default function RoleScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { register } = useProfile();
  const { data: session } = authClient.useSession();
  const [role, setRole] = useState<Role | null>(null);
  // Filled in from the Google account when Google shares it
  const [phone, setPhone] = useState(session?.user.phoneNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!role) return;
    setBusy(true);
    setError(null);
    try {
      await register(role, phone.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setError(null);
    try {
      await authClient.signOut();
    } catch (e) {
      console.warn("Sign out failed", e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading} accessibilityRole="header">Who are you?</Text>
      <Text style={styles.subtitle}>This sets up your SafeStep account.</Text>

      <View style={styles.options} accessibilityRole="radiogroup">
        {OPTIONS.map(({ role: r, title, description, icon: Icon }) => {
          const selected = role === r;
          const fg = selected ? colors.onCard : colors.text;
          return (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={title}
              accessibilityHint={description}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                <Icon size={30} color={fg} />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, { color: fg }]}>{title}</Text>
                <Text style={[styles.optionDescription, { color: fg }]}>{description}</Text>
              </View>
              {selected ? <Check size={24} color={fg} /> : null}
            </Pressable>
          );
        })}
      </View>

      <Field
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="416-555-0101"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Continue" onPress={submit} loading={busy} disabled={!role || !phone.trim()} />
      <LinkText onPress={handleSignOut}>Use a different account</LinkText>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.background },
    container: { flexGrow: 1, justifyContent: "center", padding: 24 },
    heading: { ...TYPE.headingXL, color: c.text, marginBottom: SPACING.sm },
    subtitle: { ...TYPE.bodyL, color: c.muted, marginBottom: SPACING.lg },
    options: { gap: 12 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      padding: 18,
      borderRadius: RADIUS.lg,
      backgroundColor: c.surface,
    },
    optionSelected: { backgroundColor: c.card },
    optionIcon: {
      width: 56,
      height: 56,
      borderRadius: RADIUS.pill,
      backgroundColor: c.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    optionIconSelected: { backgroundColor: "rgba(0,0,0,0.08)" },
    optionText: { flex: 1, gap: 2 },
    optionTitle: TYPE.titleL,
    optionDescription: { ...TYPE.bodyM, opacity: 0.75 },
  }),
);
