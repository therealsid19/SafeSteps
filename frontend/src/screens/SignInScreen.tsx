import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Footprints } from "lucide-react-native";

import { Button, ErrorText } from "../components/Form";
import { RADIUS, SPACING, TYPE } from "../constants/theme";
import { makeStyles, useTheme } from "../context/ThemeContext";
import { signInWithGoogle } from "../lib/auth-client";

export default function SignInScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      const { error } = await signInWithGoogle();
      if (error) setError(error.message || "Google sign-in failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Footprints size={36} color={colors.onAccent} strokeWidth={2} />
        </View>
        <Text style={styles.brand}>SafeStep</Text>
        <Text style={styles.heading} accessibilityRole="header">
          Find your way, with someone looking out for you.
        </Text>
      </View>
      <View>
        <ErrorText>{error}</ErrorText>
        <Button title="Continue with Google" onPress={handleGoogle} loading={busy} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "space-between",
      padding: 24,
      paddingBottom: 40,
      backgroundColor: c.background,
    },
    hero: { flex: 1, justifyContent: "center", gap: SPACING.md },
    logo: {
      width: 72,
      height: 72,
      borderRadius: RADIUS.lg,
      backgroundColor: c.accent,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.sm,
    },
    brand: { ...TYPE.titleM, color: c.muted },
    heading: { ...TYPE.headingXL, color: c.text },
  }),
);
