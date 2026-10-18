
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "../constants/theme";

type Props = {
  title: string;
  description: string;
};

export default function PlaceholderScreen({
  title,
  description,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 12,
  },
  description: {
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 24,
  },
});
