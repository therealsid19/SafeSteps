import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { RADIUS, TYPE } from "../constants/theme";
import { makeStyles } from "../context/ThemeContext";

/** Solid circle with the person's first initial. */
export default function Avatar({ name, size = 48 }: { name?: string | null; size?: number }) {
  const styles = useStyles();
  const initial = (name?.trim()[0] ?? "?").toUpperCase();
  return (
    <View
      style={[styles.circle, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={[styles.initial, { fontSize: size * 0.42, lineHeight: size * 0.52 }]}>{initial}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    circle: {
      borderRadius: RADIUS.pill,
      backgroundColor: c.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    initial: { ...TYPE.titleL, color: c.text },
  }),
);
