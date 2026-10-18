
import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";

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
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!preview) {
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        },
        350
      );
    }
  }, [latitude, longitude, preview]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude,
          longitude,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        }}
        scrollEnabled={!preview}
        zoomEnabled={!preview}
        rotateEnabled={!preview}
        pitchEnabled={!preview}
        pointerEvents={preview ? "none" : "auto"}
        accessibilityLabel="Map showing the patient's last known location"
      >
        <Marker
          coordinate={{ latitude, longitude }}
          title="Patient's last known location"
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: 12,
  },
});
