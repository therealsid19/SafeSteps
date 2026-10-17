import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Mail, Mic, Navigation, Phone, ShieldCheck, Users } from "lucide-react-native";

import Avatar from "../components/Avatar";
import BigAction from "../components/BigAction";
import { Button } from "../components/Form";
import { RADIUS, SPACING, TYPE } from "../constants/theme";
import { useProfile } from "../context/ProfileContext";
import { makeStyles, useTheme } from "../context/ThemeContext";
import type { User } from "../lib/api";
import type { RootStackParamList, TabParamList } from "../types/navigation";

type HomeNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, "Home">,
  NativeStackNavigationProp<RootStackParamList>
>;

/** Room at the bottom so content clears the floating tab bar. */
const TAB_BAR_SPACE = 120;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const firstName = (u?: User | null) => u?.name?.trim().split(/\s+/)[0] || null;

export default function HomeScreen() {
  const { profile } = useProfile();
  return profile?.role === "caretaker" ? <CaregiverHome /> : <PatientHome />;
}

/** Two huge actions and a talk button. Few elements, so VoiceOver has few stops. */
function PatientHome() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<HomeNavigationProp>();
  const { profile, partner } = useProfile();
  const me = firstName(profile);
  const helper = firstName(partner);

  function getHelp() {
    if (partner?.phone_number) Linking.openURL(`tel:${partner.phone_number.replace(/[^\d+]/g, "")}`);
    else navigation.navigate("Help");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.patientContent}>
        <View style={styles.greeting} accessibilityRole="header">
          <Text style={styles.headingL}>
            {greeting()}
            {me ? `, ${me}` : ""}
          </Text>
          <Text style={styles.subtitle}>How can I help you today?</Text>
        </View>

        <BigAction
          title="Explore around me"
          hint="Hear what's in front of you"
          icon={Navigation}
          onPress={() => navigation.navigate("Camera")}
        />
        <BigAction
          title="Get help"
          hint={helper ? `Call ${helper}, your caregiver` : "Reach someone you trust"}
          icon={Phone}
          tone="accent"
          onPress={getHelp}
        />

        <Pressable
          onPress={() => navigation.navigate("Listening")}
          accessibilityRole="button"
          accessibilityLabel="Tap to speak"
          accessibilityHint='Try saying "Find my keys"'
          style={({ pressed }) => [styles.talk, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.mic}>
            <Mic size={28} color={colors.onPrimary} strokeWidth={2} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.talkTitle}>Tap to speak</Text>
            <Text style={styles.talkHint}>Try saying “Find my keys”</Text>
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

/** Who you look after, how to reach them, and their alerts. */
function CaregiverHome() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation<HomeNavigationProp>();
  const { profile, partner } = useProfile();
  const me = firstName(profile);
  const them = firstName(partner) ?? "your patient";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.caregiverContent} showsVerticalScrollIndicator={false}>
        <View accessibilityRole="header">
          <Text style={styles.small}>{greeting()}</Text>
          <Text style={styles.headingL}>{me ?? "Welcome"}</Text>
        </View>

        {partner ? (
          <View style={styles.card}>
            <View style={styles.row}>
              <Avatar name={partner.name || partner.email} />
              <View style={styles.flex}>
                <Text style={styles.titleL}>{partner.name || partner.email}</Text>
                <Text style={styles.small}>Your patient</Text>
              </View>
            </View>
            <View style={styles.detail}>
              <Mail size={18} color={colors.muted} />
              <Text style={styles.detailText}>{partner.email}</Text>
            </View>
            {partner.phone_number ? (
              <View style={styles.detail}>
                <Phone size={18} color={colors.muted} />
                <Text style={styles.detailText}>{partner.phone_number}</Text>
              </View>
            ) : null}
            {partner.phone_number ? (
              <Button
                title={`Call ${them}`}
                icon={Phone}
                onPress={() => Linking.openURL(`tel:${partner.phone_number!.replace(/[^\d+]/g, "")}`)}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Users size={28} color={colors.text} />
            <Text style={styles.titleL}>Pair with your patient</Text>
            <Text style={styles.small}>Add the person you look after using the email they signed up with.</Text>
            <Button title="Go to People" onPress={() => navigation.navigate("People")} />
          </View>
        )}

        <Text style={styles.headingM}>Recent alerts</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.okIcon}>
              <ShieldCheck size={24} color={colors.success} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.titleM}>No alerts</Text>
              <Text style={styles.small}>
                Falls and location alerts for {them} will show up here.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    flex: { flex: 1 },

    // Patient
    patientContent: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: SPACING.md,
      paddingBottom: TAB_BAR_SPACE,
      gap: 14,
    },
    greeting: { gap: SPACING.xs, marginBottom: SPACING.sm },
    headingL: { ...TYPE.headingL, color: c.text },
    subtitle: { ...TYPE.bodyL, color: c.muted },
    talk: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.md,
      backgroundColor: c.surface,
      borderRadius: RADIUS.pill,
      padding: 10,
      paddingRight: SPACING.lg,
    },
    mic: {
      width: 60,
      height: 60,
      borderRadius: RADIUS.pill,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    talkTitle: { ...TYPE.titleL, color: c.text },
    talkHint: { ...TYPE.bodyM, color: c.muted },

    // Caregiver
    caregiverContent: {
      paddingHorizontal: 18,
      paddingTop: SPACING.md,
      paddingBottom: TAB_BAR_SPACE,
      gap: SPACING.md,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: RADIUS.xl,
      padding: 18,
      gap: 12,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    detail: { flexDirection: "row", alignItems: "center", gap: 10 },
    detailText: { ...TYPE.bodyL, color: c.text, flexShrink: 1 },
    okIcon: {
      width: 48,
      height: 48,
      borderRadius: RADIUS.md,
      backgroundColor: c.successSurface,
      alignItems: "center",
      justifyContent: "center",
    },
    headingM: { ...TYPE.headingM, color: c.text, marginTop: SPACING.sm },
    titleL: { ...TYPE.titleL, color: c.text },
    titleM: { ...TYPE.titleM, color: c.text },
    small: { ...TYPE.bodyM, color: c.muted },
  }),
);
