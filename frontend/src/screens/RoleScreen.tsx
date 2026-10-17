import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { HeartHandshake, User as UserIcon } from "lucide-react-native";

import { Button, ErrorText, Field, LinkText } from "../components/Form";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { useProfile } from "../context/ProfileContext";
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
  const { register } = useProfile();
  const [role, setRole] = useState<Role | null>(null);
  const { data: session } = authClient.useSession();
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
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Who are you?</Text>
      <Text style={styles.subtitle}>This sets up your SafeStep account.</Text>

      <View style={styles.options}>
        {OPTIONS.map(({ role: r, title, description, icon: Icon }) => {
          const selected = role === r;
          return (
            <Pressable
              key={r}
              onPress={() => setRole(r)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={title}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Icon size={36} color={selected ? COLORS.cyan : COLORS.muted} />
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{title}</Text>
                <Text style={styles.optionDescription}>{description}</Text>
              </View>
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

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { flexGrow: 1, justifyContent: "center", padding: 24 },
  heading: { color: COLORS.text, fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: COLORS.muted, fontSize: 16, marginBottom: SPACING.lg },
  options: { gap: 12 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 18,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: "transparent",
  },
  optionSelected: { borderColor: COLORS.cyan, backgroundColor: "#142B39" },
  optionText: { flex: 1 },
  optionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "600", marginBottom: 4 },
  optionDescription: { color: COLORS.muted, fontSize: 14, lineHeight: 20 },
});
