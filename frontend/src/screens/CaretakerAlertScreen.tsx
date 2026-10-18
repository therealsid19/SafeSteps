import React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Phone } from "lucide-react-native";

import { Button } from "../components/Form";
import { SPACING, TYPE } from "../constants/theme";
import { useProfile } from "../context/ProfileContext";
import { makeStyles } from "../context/ThemeContext";
import type { RootStackParamList } from "../types/navigation";

/** Opened from a fall push: who fell, when, and a one-tap call. */
export default function CaretakerAlertScreen() {
  const styles = useStyles();
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, "CaretakerAlert">>();
  const { partner } = useProfile();

  // The push only carries the patient id; the phone number comes from the care link.
  const patient = partner?.id === params.patientId ? partner : null;
  const name = params.patientName || patient?.name || "Your patient";
  const phone = patient?.phone_number?.replace(/[^\d+]/g, "");
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
          {"They didn't answer SafeStep's safety check. Check on them now."}
        </Text>
      </View>

      <View style={styles.actions}>
        {phone ? (
          <Button
            title={`Call ${name}`}
            icon={Phone}
            variant="accent"
            onPress={() => Linking.openURL(`tel:${phone}`)}
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
