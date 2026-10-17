
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MapPin, ChevronRight } from "lucide-react-native";

import PatientMap from "../components/PatientMap";
import type { PartnerLocationResponse } from "../lib/api";
import { makeStyles, useTheme } from "../context/ThemeContext";

type Props = {
  data: PartnerLocationResponse | null;
  loading: boolean;
  error: string | null;
  onPress: () => void;
};

function formatLastUpdated(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString();
}

export default function PatientLocationCard({
  data,
  loading,
  error,
  onPress,
}: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const location = data?.location;

  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      disabled={!location}
      accessibilityRole="button"
      accessibilityLabel={
        location
          ? "View patient's location on full map"
          : "Patient location unavailable"
      }
    >
      <View style={styles.header}>
        <MapPin size={22} color={colors.text} />
        <Text style={styles.title}>Patient location</Text>
        <ChevronRight size={22} color={colors.muted} />
      </View>

      {location ? (
        <>
          <View style={styles.map}>
            <PatientMap
              latitude={location.latitude}
              longitude={location.longitude}
              preview
            />
          </View>

          <Text style={styles.detail}>
            Last updated: {formatLastUpdated(location.recorded_at)}
          </Text>

          <Text style={styles.link}>
            Tap to view full map
          </Text>
        </>
      ) : (
        <Text style={styles.detail}>
          {loading
            ? "Loading location..."
            : error
              ? error
              : data?.sharing_enabled
                ? "No location has been recorded yet."
                : "Location sharing is off or unavailable."}
        </Text>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 18,
      gap: 12,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    title: {
      flex: 1,
      fontSize: 19,
      fontWeight: "700",
      color: c.text,
    },
    map: {
      height: 170,
      borderRadius: 12,
      overflow: "hidden",
    },
    detail: {
      fontSize: 14,
      color: c.muted,
    },
    link: {
      fontSize: 15,
      fontWeight: "600",
      color: c.text,
    },
  })
);
