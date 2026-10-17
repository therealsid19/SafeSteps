
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import CameraScreen from "../screens/CameraScreen";

import {
  House,
  Clock3,
  Users,
  Settings,
} from "lucide-react-native";

import HomeScreen from "../screens/HomeScreen";
import PlaceholderScreen from "../screens/PlaceholderScreen";
import ListeningScreen from "../screens/ListeningScreen";
import PeopleScreen from "../screens/PeopleScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { COLORS } from "../constants/theme";

import type {
  RootStackParamList,
  TabParamList,
} from "../types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.muted,
        tabBarStyle: {
          backgroundColor: COLORS.background,
          borderTopColor: COLORS.border,
          height: 65,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          paddingBottom: 5,
        },
        tabBarIcon: ({ color, size }) => {
          switch (route.name) {
            case "Home":
              return <House color={color} size={size} />;
            case "People":
              return <Users color={color} size={size} />;
            case "Settings":
              return <Settings color={color} size={size} />;
          }
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />


      <Tab.Screen name="People" component={PeopleScreen} />

      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="MainTabs"
        screenOptions={{
          headerStyle: {
            backgroundColor: COLORS.background,
          },
          headerTintColor: COLORS.text,
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: COLORS.background,
          },
        }}
      >
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />

        <Stack.Screen
        name="Listening"
        component={ListeningScreen}
        options={{ headerShown: false }}
        />

        <Stack.Screen
        name="Camera"
        component={CameraScreen}
        options={{ headerShown: false }}
        />

        <Stack.Screen name="Found" options={{ title: "" }}>
          {() => (
            <PlaceholderScreen
              title="Object Found!"
              description="Spoken guidance and object details will appear here."
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Awareness" options={{ title: "Around You" }}>
          {() => (
            <PlaceholderScreen
              title="Environmental Awareness"
              description="Potential obstacle warnings will appear here."
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Help" options={{ title: "Get Help" }}>
          {() => (
            <PlaceholderScreen
              title="Get Help"
              description="Request assistance from a trusted contact."
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
