import React, { useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mail, Phone } from "lucide-react-native";

import Avatar from "../components/Avatar";
import { Button, ErrorText, Field } from "../components/Form";
import { RADIUS, SPACING, TYPE } from "../constants/theme";
import { useProfile } from "../context/ProfileContext";
import { makeStyles, useTheme } from "../context/ThemeContext";

/** "Your Support Circle": see or set your paired patient / caretaker. */
export default function PeopleScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
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
    const question = `Unpair from ${partner?.name || partner?.email}?`;
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
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading} accessibilityRole="header">Your support circle</Text>
        <Text style={styles.subtitle}>
          {partner
            ? `You're paired with your ${partnerLabel}.`
            : `Pair with your ${partnerLabel} using the email they signed up with.`}
        </Text>

        {partner ? (
          <>
            <View style={styles.card}>
              <View style={styles.row}>
                <Avatar name={partner.name || partner.email} size={56} />
                <View style={styles.flexText}>
                  <Text style={styles.cardName}>{partner.name || partner.email}</Text>
                  <Text style={styles.cardRole}>Your {partner.role}</Text>
                </View>
              </View>
              <View style={styles.cardRow}>
                <Mail size={20} color={colors.muted} />
                <Text style={styles.cardText}>{partner.email}</Text>
              </View>
              {partner.phone_number ? (
                <View style={styles.cardRow}>
                  <Phone size={20} color={colors.muted} />
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
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.background },
    container: { padding: 20, paddingTop: SPACING.md, paddingBottom: 140 },
    heading: { ...TYPE.headingL, color: c.text, marginBottom: SPACING.sm },
    subtitle: { ...TYPE.bodyL, color: c.muted, marginBottom: SPACING.md },
    hint: { ...TYPE.bodyM, color: c.muted, marginTop: SPACING.sm },
    card: {
      backgroundColor: c.surface,
      borderRadius: RADIUS.xl,
      padding: 20,
      gap: 14,
      marginTop: SPACING.sm,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 14 },
    flexText: { flex: 1 },
    cardName: { ...TYPE.titleL, color: c.text },
    cardRole: { ...TYPE.bodyM, color: c.muted, textTransform: "capitalize" },
    cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    cardText: { ...TYPE.bodyL, color: c.text, flexShrink: 1 },
  }),
);
