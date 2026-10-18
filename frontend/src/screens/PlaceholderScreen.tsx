import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { SPACING, TYPE } from "../constants/theme";
import { makeStyles } from "../context/ThemeContext";

type Props = {
  title: string;
  description: string;
};

export default function PlaceholderScreen({ title, description }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      padding: 24,
      justifyContent: "center",
    },
    title: { ...TYPE.headingL, color: c.text, marginBottom: SPACING.md },
    description: { ...TYPE.bodyL, color: c.muted },
  }),
);
