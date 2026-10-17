import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@clerk/expo";

import { Button } from "../components/Form";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { useProfile } from "../context/ProfileContext";
import { API_URL } from "../lib/api";

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { profile } = useProfile();

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

      <Button title="Sign out" variant="danger" onPress={() => signOut()} />
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
