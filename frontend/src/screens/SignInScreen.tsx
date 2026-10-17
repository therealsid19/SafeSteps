import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, ErrorText } from "../components/Form";
import { COLORS } from "../constants/theme";
import { signInWithGoogle } from "../lib/auth-client";

export default function SignInScreen() {
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
      <Text style={styles.brand}>SafeStep</Text>
      <Text style={styles.heading}>Welcome</Text>
      <Text style={styles.subtitle}>Sign in with your Google account to continue.</Text>
      <ErrorText>{error}</ErrorText>
      <Button title="Continue with Google" onPress={handleGoogle} loading={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: COLORS.background },
  brand: { color: COLORS.cyan, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  heading: { color: COLORS.text, fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: COLORS.muted, fontSize: 16, marginBottom: 24 },
});
