
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";


import { useNavigation } from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type {
  RootStackParamList,
  TabParamList,
} from "../types/navigation";


import {
  Search,
  Navigation,
  Clock3,
  Phone,
  Mic,
  Settings,
  Eye,
} from "lucide-react-native";

import { LinearGradient } from "expo-linear-gradient";

import ActionCard from "../components/ActionCard";
import { COLORS } from "../constants/theme";


type HomeNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, "Home">,
  NativeStackNavigationProp<RootStackParamList>
>;


export default function HomeScreen() {

    const navigation = useNavigation<HomeNavigationProp>();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Pressable
  accessibilityRole="button"
  accessibilityLabel="Open settings"
  onPress={() => navigation.navigate("Settings")}
>
  <Settings size={26} color={COLORS.text} />
</Pressable>

      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.heading}>Good morning, ✨</Text>
        <Text style={styles.subtitle}>
          How can I help you today?
        </Text>
      </View>

      {/* Feature cards */}
      <View style={styles.grid}>
        

          <ActionCard
            title="Explore around me"
            icon={Navigation}
            iconColor={COLORS.cyan}
            backgroundColor="#142B39"
            onPress={() => console.log("Explore")}
          />

          <ActionCard
            title="Get help"
            icon={Phone}
            size={30}
            iconColor="#EF8196"
            backgroundColor="#38202E"
            onPress={() => console.log("Help")}
          />
        </View>

      {/* Voice button */}
      <View style={styles.voiceSection}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tap to speak"
          onPress={() => navigation.navigate("Listening")}
        >
          <LinearGradient
            colors={["#3158BD", "#4778F5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.voiceButton}
          >
            <Mic size={24} color="#FFFFFF" />
            <Text style={styles.voiceText}>
              Tap to speak
            </Text>
          </LinearGradient>
        </Pressable>

        <Text style={styles.hint}>
          Try saying "Find my keys"
        </Text>
      </View>
    </ScrollView>
  );
}



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 55,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#142E4A",
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
  },
  greeting: {
    marginBottom: 30,
  },
  heading: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: COLORS.muted,
    fontSize: 16,
  },
  grid: {
    gap: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  voiceSection: {
    marginTop: 45,
    alignItems: "center",
  },
  voiceButton: {
    width: 270,
    height: 58,
    borderRadius: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  voiceText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "600",
  },
  hint: {
    marginTop: 14,
    color: COLORS.muted,
    fontSize: 13,
  },
});
