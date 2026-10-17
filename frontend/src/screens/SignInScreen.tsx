import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { useSignIn, useSignUp } from "@clerk/expo";

import { Button, ErrorText, Field, LinkText } from "../components/Form";
import { COLORS } from "../constants/theme";

type Mode = "signIn" | "signUp";
type Step = "credentials" | "code";

/** Clerk errors come back as { message, longMessage } objects. */
function messageOf(error: unknown): string | null {
  if (!error) return null;
  const e = error as { longMessage?: string; message?: string; errors?: { longMessage?: string; message?: string }[] };
  return e.errors?.[0]?.longMessage || e.errors?.[0]?.message || e.longMessage || e.message || "Something went wrong";
}

export default function SignInScreen() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const [mode, setMode] = useState<Mode>("signIn");
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  // ----- sign in -----
  const submitSignIn = () =>
    run(async () => {
      const { error } = await signIn.password({ identifier: email.trim(), password });
      if (error) return setError(messageOf(error));

      if (signIn.status === "complete") {
        await signIn.finalize();
      } else if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
        // New device: Clerk emails a code to confirm it's really you
        const sent = await signIn.mfa.sendEmailCode();
        if (sent.error) return setError(messageOf(sent.error));
        setStep("code");
      } else {
        setError(`Sign-in needs another step (${signIn.status}) that this app doesn't support yet.`);
      }
    });

  const verifySignInCode = () =>
    run(async () => {
      const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (error) return setError(messageOf(error));
      if (signIn.status === "complete") await signIn.finalize();
      else setError("That code didn't finish signing in. Try again.");
    });

  // ----- sign up -----
  const submitSignUp = () =>
    run(async () => {
      const { error } = await signUp.password({ emailAddress: email.trim(), password });
      if (error) return setError(messageOf(error));
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return setError(messageOf(sent.error));
      setStep("code");
    });

  const verifySignUpCode = () =>
    run(async () => {
      const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (error) return setError(messageOf(error));
      if (signUp.status === "complete") await signUp.finalize();
      else setError("Your account still needs more details. Check your Clerk settings.");
    });

  const switchMode = (next: Mode) => {
    setMode(next);
    setStep("credentials");
    setCode("");
    setError(null);
  };

  const isSignUp = mode === "signUp";

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>SafeStep</Text>

        {step === "credentials" ? (
          <>
            <Text style={styles.heading}>{isSignUp ? "Create your account" : "Welcome back"}</Text>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder="Password"
            />
            <ErrorText>{error}</ErrorText>
            <Button
              title={isSignUp ? "Sign up" : "Sign in"}
              onPress={isSignUp ? submitSignUp : submitSignIn}
              loading={busy}
              disabled={!email || !password}
            />
            <LinkText onPress={() => switchMode(isSignUp ? "signIn" : "signUp")}>
              {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
            </LinkText>
          </>
        ) : (
          <>
            <Text style={styles.heading}>Check your email</Text>
            <Text style={styles.subtitle}>We sent a code to {email.trim()}.</Text>
            <Field
              label="Verification code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              placeholder="123456"
            />
            <ErrorText>{error}</ErrorText>
            <Button
              title="Verify"
              onPress={isSignUp ? verifySignUpCode : verifySignInCode}
              loading={busy}
              disabled={!code}
            />
            <LinkText onPress={() => switchMode(mode)}>Start over</LinkText>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.background },
  container: { flexGrow: 1, justifyContent: "center", padding: 24 },
  brand: { color: COLORS.cyan, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  heading: { color: COLORS.text, fontSize: 28, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: COLORS.muted, fontSize: 16 },
});
