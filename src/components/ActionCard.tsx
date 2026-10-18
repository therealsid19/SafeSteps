
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { COLORS } from "../constants/theme";

type ActionCardProps = {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  backgroundColor: string;
  size?: number;
  onPress: () => void;
};

export default function ActionCard({
  title,
  icon: Icon,
  iconColor,
  backgroundColor,
  onPress,
}: ActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={styles.iconContainer}>
        <Icon
          size={60}
          color={iconColor}
          strokeWidth={2}
        />
      </View>

      <Text style={styles.title}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 150,
    borderRadius: 20,
    padding: 16,
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconContainer: {
    marginTop: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 22,
  },
});
