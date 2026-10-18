import React, { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Phone } from "lucide-react-native";

import { Button } from "../components/Form";
import { SPACING, TYPE } from "../constants/theme";
import { useProfile } from "../context/ProfileContext";
import { makeStyles } from "../context/ThemeContext";
import { useApi, type User } from "../lib/api";
import { telUrl } from "../lib/phone";
import type { RootStackParamList } from "../types/navigation";

const WHAT_HAPPENED = {
  timeout: "They didn't answer SafeStep's safety check.",
  help: "They asked for help.",
  voice_error: "SafeStep couldn't complete its voice safety check with them.",
} as const;

/** Opened from a fall push: who fell, when, and a one-tap call. */
export default function CaretakerAlertScreen() {
  const styles = useStyles();
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, "CaretakerAlert">>();
  const { partner } = useProfile();
  const api = useApi();

  // The push only carries the patient id. Look up their number among all of this
  // caretaker's patients (`partner` is just the first one).
  const [patient, setPatient] = useState<User | null>(
    partner?.id === params.patientId ? partner : null,
  );
  useEffect(() => {
    api<{ patients: User[] }>("GET", "/me/patients")
      .then(({ patients }) => {
        const match = patients.find((p) => p.id === params.patientId);
        if (match) setPatient(match);
      })
      .catch((e) => console.warn("Couldn't load the patient's phone number:", e));
  }, [api, params.patientId]);

  const name = params.patientName || patient?.name || "Your patient";
  const call = telUrl(patient?.phone_number);
  const detected = new Date(params.detectedAt);
  const when = Number.isFinite(detected.getTime())
    ? detected.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.title}>{name} may have fallen</Text>
        <Text style={styles.description}>
          {when ? `Detected at ${when}. ` : ""}
          {`${WHAT_HAPPENED[params.reason ?? "timeout"]} Check on them now.`}
        </Text>
      </View>

      <View style={styles.actions}>
        {call ? (
          <Button
            title={`Call ${name}`}
            icon={Phone}
            variant="accent"
            onPress={() => Linking.openURL(call)}
          />
        ) : (
          <Text style={styles.description}>
            No phone number on file for {name}. Contact them another way.
          </Text>
        )}
        <Button title="Close" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.dangerSurface, padding: SPACING.lg },
    body: { flex: 1, justifyContent: "center", gap: SPACING.md },
    title: { ...TYPE.headingXL, color: c.text },
    description: { ...TYPE.bodyL, color: c.text },
    actions: { gap: SPACING.md },
  }),
);
