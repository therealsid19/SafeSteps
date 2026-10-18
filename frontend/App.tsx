import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";

import AppNavigator from "./src/navigation/AppNavigator";
import SignInScreen from "./src/screens/SignInScreen";
import RoleScreen from "./src/screens/RoleScreen";
import { Button } from "./src/components/Form";
import { ProfileProvider, useProfile } from "./src/context/ProfileContext";
import { ThemeProvider, makeStyles, useTheme } from "./src/context/ThemeContext";
import { authClient } from "./src/lib/auth-client";
import { TYPE } from "./src/constants/theme";

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  return (
    <SafeAreaProvider>
      {/* Dark (patient) look until we know the user is a caregiver */}
      <ThemeProvider scheme="dark">
        {fontsLoaded ? <AuthGate /> : <Loading />}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Signed out -> sign-in screen. Signed in -> load the SafeStep profile. */
function AuthGate() {
  const styles = useStyles();
  const { data: session, isPending } = authClient.useSession();

  if (isPending && !session) return <Loading />;
  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <ThemedStatusBar />
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

/** No profile yet -> pick patient/caretaker. Otherwise -> the main app, themed by role. */
function ProfileGate() {
  const styles = useStyles();
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
        <ThemedStatusBar />
        <RoleScreen />
      </SafeAreaView>
    );
  }
  return (
    <ThemeProvider scheme={profile.role === "caretaker" ? "light" : "dark"}>
      <ThemedStatusBar />
      <AppNavigator />
    </ThemeProvider>
  );
}

function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

function Loading() {
  const { colors } = useTheme();
  return (
    <Centered>
      <ThemedStatusBar />
      <ActivityIndicator size="large" color={colors.text} />
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.centered}>{children}</View>;
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    centered: {
      flex: 1,
      backgroundColor: c.background,
      alignItems: "stretch",
      justifyContent: "center",
      padding: 24,
    },
    message: { ...TYPE.bodyL, color: c.text, textAlign: "center" },
  }),
);
