import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import AppNavigator from "./src/navigation/AppNavigator";
import SignInScreen from "./src/screens/SignInScreen";
import RoleScreen from "./src/screens/RoleScreen";
import { Button } from "./src/components/Form";
import { ProfileProvider, useProfile } from "./src/context/ProfileContext";
import { authClient } from "./src/lib/auth-client";
import { COLORS } from "./src/constants/theme";

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthGate />
    </SafeAreaProvider>
  );
}

/** Signed out -> sign-in screen. Signed in -> load the SafeStep profile. */
function AuthGate() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending && !session) return <Loading />;
  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <SignInScreen />
      </SafeAreaView>
    );
  }
  return (
    <ProfileProvider key={session.user.id}>
      <ProfileGate />
    </ProfileProvider>
  );
}

/** No profile yet -> pick patient/caretaker. Otherwise -> the main app. */
function ProfileGate() {
  const { profile, loading, error, refresh } = useProfile();

  if (loading && !profile) return <Loading />;
  if (error) {
    return (
      <Centered>
        <Text style={styles.message}>{error}</Text>
        <Button title="Try again" onPress={refresh} />
      </Centered>
    );
  }
  if (!profile) {
    return (
      <SafeAreaView style={styles.safe}>
        <RoleScreen />
      </SafeAreaView>
    );
  }
  return <AppNavigator />;
}

function Loading() {
  return (
    <Centered>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "stretch",
    justifyContent: "center",
    padding: 24,
  },
  message: { color: COLORS.text, fontSize: 16, lineHeight: 24, textAlign: "center" },
});
