import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { House, Settings2, Users, type LucideIcon } from "lucide-react-native";

import { RADIUS, SPACING, TYPE } from "../constants/theme";
import { makeStyles, useTheme } from "../context/ThemeContext";

const ICONS: Record<string, LucideIcon> = { Home: House, People: Users, Settings: Settings2 };

/** Floating pill tab bar. Labels always show (easier for low vision than icons alone). */
export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  // Patient (dark): warm surface bar, cream active pill. Caregiver (light): dark bar, white active pill.
  const barBg = scheme === "dark" ? colors.surface : colors.primary;
  const activeBg = scheme === "dark" ? colors.card : colors.surface;
  const activeFg = colors.onCard;
  const idleFg = scheme === "dark" ? colors.muted : "rgba(255,255,255,0.65)";

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: barBg }]} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const Icon = ICONS[route.name] ?? House;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={route.name}
              style={[styles.item, focused && { backgroundColor: activeBg }]}
            >
              <Icon size={20} color={focused ? activeFg : idleFg} strokeWidth={2} />
              <Text
                style={[styles.label, { color: focused ? activeFg : idleFg }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                // Like the system tab bar: grow with text size, but not past what fits
                maxFontSizeMultiplier={1.3}
              >
                {route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    wrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20 },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: RADIUS.pill,
      padding: 6,
      shadowColor: "#000",
      shadowOpacity: 0.18,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    // Equal thirds, so the active pill can never push past the bar's edge
    item: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 56,
      paddingHorizontal: 8,
      borderRadius: RADIUS.pill,
    },
    label: { ...TYPE.titleM, fontSize: 15, flexShrink: 1 },
  }),
);
