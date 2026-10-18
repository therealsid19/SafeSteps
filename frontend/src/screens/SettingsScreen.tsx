import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LogOut } from "lucide-react-native";

import { Button, ErrorText } from "../components/Form";
import { RADIUS, SPACING, TYPE } from "../constants/theme";
import { useProfile } from "../context/ProfileContext";
import { makeStyles } from "../context/ThemeContext";
import { authClient } from "../lib/auth-client";
import { API_URL, useApi } from "../lib/api";
import { unregisterFromFallAlerts } from "../lib/notifications";

export default function SettingsScreen() {
  const styles = useStyles();
  const { profile } = useProfile();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useApi();

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);
    try {
      // While still signed in: the server only removes your own token
      await unregisterFromFallAlerts(api);
      await authClient.signOut();
    } catch (e) {
      console.warn("Sign out failed", e);
      setError(e instanceof Error ? e.message : String(e));
      setSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading} accessibilityRole="header">Settings</Text>

        <View style={styles.card}>
          <Row label="Name" value={profile?.name} />
          <Row label="Email" value={profile?.email} />
          <Row label="Role" value={profile?.role === "caretaker" ? "Caretaker" : "Patient"} />
          <Row label="Phone" value={profile?.phone_number ?? "Not set"} last />
        </View>

        <Text style={styles.note}>Voice and accessibility preferences will appear here.</Text>

        <ErrorText>{error}</ErrorText>
        <Button title="Sign out" icon={LogOut} variant="danger" onPress={handleSignOut} loading={signingOut} />
        <Text style={styles.server}>Server: {API_URL}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.row, last && styles.rowLast]} accessible accessibilityLabel={`${label}: ${value ?? "not set"}`}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value ?? "-"}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.background },
    container: { padding: 20, paddingTop: SPACING.md, paddingBottom: 140 },
    heading: { ...TYPE.headingL, color: c.text, marginBottom: SPACING.lg },
    card: { backgroundColor: c.surface, borderRadius: RADIUS.xl, paddingHorizontal: 20 },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: SPACING.md,
      paddingVertical: 18,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rowLast: { borderBottomWidth: 0 },
    label: { ...TYPE.bodyL, color: c.muted },
    value: { ...TYPE.titleM, color: c.text, flexShrink: 1, textAlign: "right" },
    note: { ...TYPE.bodyM, color: c.muted, marginTop: SPACING.lg },
    server: { ...TYPE.caption, color: c.muted, textAlign: "center", marginTop: SPACING.md },
  }),
);
