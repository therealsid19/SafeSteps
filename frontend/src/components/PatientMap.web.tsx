
import React from "react";
import { StyleSheet, View } from "react-native";

type Props = {
  latitude: number;
  longitude: number;
  preview?: boolean;
};

export default function PatientMap({
  latitude,
  longitude,
  preview = false,
}: Props) {
  const mapUrl =
    "https://www.openstreetmap.org/export/embed.html" +
    `?bbox=${longitude - 0.005},${latitude - 0.005},` +
    `${longitude + 0.005},${latitude + 0.005}` +
    `&layer=mapnik&marker=${latitude},${longitude}`;

  return (
    <View style={styles.container}>
      <iframe
        title="Patient's last known location"
        src={mapUrl}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          pointerEvents: preview ? "none" : "auto",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
    overflow: "hidden",
  },
});
