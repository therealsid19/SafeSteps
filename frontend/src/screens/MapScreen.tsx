
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import PatientMap from "../components/PatientMap";
import { usePartnerLocation } from "../lib/usePartnerLocation";

export default function MapScreen() {
  const { data, loading, error, refresh } = usePartnerLocation();

  const location = data?.location;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.title}>Patient location</Text>

      {loading && !data ? (
        <ActivityIndicator size="large" />
      ) : error && !data ? (
        <Text style={styles.message}>{error}</Text>
      ) : !data?.sharing_enabled ? (
        <Text style={styles.message}>
          Your patient has not enabled location sharing.
        </Text>
      ) : !location ? (
        <Text style={styles.message}>
          No location has been shared yet.
        </Text>
      ) : (
        <>
          <Text style={styles.updated}>
            Last updated:{" "}
            {new Date(location.recorded_at).toLocaleString()}
          </Text>

          <View style={styles.mapContainer}>
            <PatientMap
              latitude={location.latitude}
              longitude={location.longitude}
            />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  updated: {
    fontSize: 14,
    color: "#666666",
  },
  message: {
    fontSize: 16,
    color: "#666666",
    marginTop: 20,
  },
  mapContainer: {
    flex: 1,
    minHeight: 300,
    borderRadius: 12,
    overflow: "hidden",
  },
});