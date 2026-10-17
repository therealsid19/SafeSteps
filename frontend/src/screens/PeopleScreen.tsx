import React, { useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Mail, Phone, UserRound } from "lucide-react-native";

import { Button, ErrorText, Field } from "../components/Form";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { useProfile } from "../context/ProfileContext";

/** "Your Support Circle": see or set your paired patient / caretaker. */
export default function PeopleScreen() {
  const { profile, partner, linkPartner, unlinkPartner, refresh, loading } = useProfile();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null;
  const partnerLabel = profile.role === "patient" ? "caretaker" : "patient";

  async function link() {
    setBusy(true);
    setError(null);
    try {
      await linkPartner(email.trim());
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    const doIt = async () => {
      setBusy(true);
      try {
        await unlinkPartner();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };
    const question = `Unpair from ${partner?.email}?`;
    if (Platform.OS === "web") {
      if (window.confirm(question)) await doIt();
    } else {
      Alert.alert(question, undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Unpair", style: "destructive", onPress: doIt },
      ]);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Your Support Circle</Text>
      <Text style={styles.subtitle}>
        {partner
          ? `You're paired with your ${partnerLabel}.`
          : `Pair with your ${partnerLabel} using the email they signed up with.`}
      </Text>

      {partner ? (
        <>
          <View style={styles.card}>
            <View style={styles.avatar}>
              <UserRound size={30} color={COLORS.cyan} />
            </View>
            <Text style={styles.cardRole}>Your {partner.role}</Text>
            <View style={styles.cardRow}>
              <Mail size={18} color={COLORS.muted} />
              <Text style={styles.cardText}>{partner.email}</Text>
            </View>
            {partner.phone_number ? (
              <View style={styles.cardRow}>
                <Phone size={18} color={COLORS.muted} />
                <Text style={styles.cardText}>{partner.phone_number}</Text>
              </View>
            ) : null}
          </View>
          <ErrorText>{error}</ErrorText>
          <Button title="Unpair" variant="danger" onPress={unlink} loading={busy} />
        </>
      ) : (
        <>
          <Field
            label={`Your ${partnerLabel}'s email`}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="name@example.com"
          />
          <Text style={styles.hint}>They need to have signed up as a {partnerLabel} first.</Text>
          <ErrorText>{error}</ErrorText>
          <Button title="Pair" onPress={link} loading={busy} disabled={!email.trim()} />
          <Button title="Refresh" variant="secondary" onPress={refresh} loading={loading} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: 22, paddingTop: 40, paddingBottom: 40 },
  heading: { color: COLORS.text, fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: COLORS.muted, fontSize: 16, lineHeight: 22, marginBottom: SPACING.md },
  hint: { color: COLORS.muted, fontSize: 13, marginTop: SPACING.sm },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 20,
    gap: 10,
    marginTop: SPACING.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#142B39",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  cardRole: { color: COLORS.text, fontSize: 20, fontWeight: "700", textTransform: "capitalize" },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardText: { color: COLORS.text, fontSize: 16 },
});
