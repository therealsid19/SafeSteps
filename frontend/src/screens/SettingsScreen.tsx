import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, ErrorText } from "../components/Form";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { useProfile } from "../context/ProfileContext";
import { authClient } from "../lib/auth-client";
import { API_URL } from "../lib/api";

export default function SettingsScreen() {
  const { profile } = useProfile();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      await authClient.signOut();
    } catch (e) {
      console.warn("Sign out failed", e);
      setError(e instanceof Error ? e.message : String(e));
      setSigningOut(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.card}>
        <Row label="Email" value={profile?.email} />
        <Row label="Role" value={profile?.role} />
        <Row label="Phone" value={profile?.phone_number ?? "Not set"} />
      </View>

      <Text style={styles.note}>
        Voice and accessibility preferences will appear here.
      </Text>

      <ErrorText>{error}</ErrorText>
      <Button title="Sign out" variant="danger" onPress={handleSignOut} loading={signingOut} />
      <Text style={styles.server}>Server: {API_URL}</Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value ?? "-"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: 22, paddingTop: 40, paddingBottom: 40 },
  heading: { color: COLORS.text, fontSize: 28, fontWeight: "700", marginBottom: SPACING.lg },
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, paddingHorizontal: 18 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  label: { color: COLORS.muted, fontSize: 16 },
  value: { color: COLORS.text, fontSize: 16, textTransform: "none", flexShrink: 1, textAlign: "right" },
  note: { color: COLORS.muted, fontSize: 14, marginTop: SPACING.lg, lineHeight: 20 },
  server: { color: COLORS.muted, fontSize: 12, textAlign: "center", marginTop: SPACING.md },
});
