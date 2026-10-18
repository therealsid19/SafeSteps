import React from "react";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useProfile } from "../context/ProfileContext";
import MapScreen from "../screens/MapScreen";

import CameraScreen from "../screens/CameraScreen";
import HomeScreen from "../screens/HomeScreen";
import ListeningScreen from "../screens/ListeningScreen";
import PeopleScreen from "../screens/PeopleScreen";
import PlaceholderScreen from "../screens/PlaceholderScreen";
import SettingsScreen from "../screens/SettingsScreen";
import TabBar from "../components/TabBar";
import { FONTS } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import FallAlertScreen from "../screens/FallAlertScreen";
import CaretakerAlertScreen from "../screens/CaretakerAlertScreen";
import { useFallDetection } from "../hooks/useFallDetection";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { useApi } from "../lib/api";
import { isFallPush, registerForFallAlerts, type FallPushData } from "../lib/notifications";

import type { RootStackParamList, TabParamList } from "../types/navigation";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MainTabs() {
  const { profile } = useProfile();
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="People" component={PeopleScreen} />

      {profile?.role === "caretaker" && (
        <Tab.Screen name="Map" component={MapScreen} />
      )}

      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function FallDetectionListener() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile } = useProfile();

  const alertActiveRef = React.useRef(false);

  useFallDetection({
    // Only a patient's phone runs the safety check; /falls/escalate rejects caretakers.
    enabled: profile?.role === "patient",
    onFallDetected: () => {
      if (alertActiveRef.current) return;

      alertActiveRef.current = true;
      navigation.navigate("FallAlert");
    },
  });

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("state", () => {
      const currentRoute =
        navigation.getState()?.routes[navigation.getState().index];

      if (currentRoute?.name !== "FallAlert") {
        alertActiveRef.current = false;
      }
    });

    return unsubscribe;
  }, [navigation]);

  return null;
}

/**
 * Caretakers: register this phone for fall pushes, and open the alert screen when one
 * arrives (app open) or is tapped (app in the background or closed).
 */
function CaretakerPush() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const api = useApi();

  // Every launch, so a changed token (reinstall, restore) reaches the server
  React.useEffect(() => {
    registerForFallAlerts(api).then((result) => {
      if (!result.ok) console.warn("Fall alerts are off on this phone:", result.reason);
    });
  }, [api]);

  React.useEffect(() => {
    const open = (data: FallPushData) =>
      navigation.navigate("CaretakerAlert", {
        incidentId: data.incidentId,
        patientId: data.patientId,
        patientName: data.patientName,
        reason: data.reason,
        detectedAt: data.detectedAt,
      });
    const opened = new Set<string>();
    const openOnce = (data: unknown) => {
      if (!isFallPush(data) || opened.has(data.incidentId)) return;
      opened.add(data.incidentId);
      open(data);
    };

    // Tapped while the app was closed: the tap that launched us. Wait until the
    // navigator can take it, then clear it so it doesn't reopen an old alert later.
    let launchTimer: ReturnType<typeof setTimeout> | undefined;
    const openLaunchTap = (tries = 0) => {
      const last = Notifications.getLastNotificationResponse();
      if (!last) return;
      if (!navigation.getState()?.routeNames?.includes("CaretakerAlert") && tries < 50) {
        launchTimer = setTimeout(() => openLaunchTap(tries + 1), 100);
        return;
      }
      openOnce(last.notification.request.content.data);
      Notifications.clearLastNotificationResponse();
    };
    openLaunchTap();

    const received = Notifications.addNotificationReceivedListener((n) =>
      openOnce(n.request.content.data),
    );
    const tapped = Notifications.addNotificationResponseReceivedListener((r) =>
      openOnce(r.notification.request.content.data),
    );
    return () => {
      clearTimeout(launchTimer);
      received.remove();
      tapped.remove();
    };
  }, [navigation]);

  return null;
}

function RoleListeners() {
  const { profile } = useProfile();
  return (
    <>
      <FallDetectionListener />
      {profile?.role === "caretaker" && Platform.OS !== "web" && <CaretakerPush />}
    </>
  );
}

export default function AppNavigator() {
  const { scheme, colors } = useTheme();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <RoleListeners />
      <Stack.Navigator
        initialRouteName="MainTabs"
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: FONTS.semibold },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
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
        <Stack.Screen
          name="FallAlert"
          component={FallAlertScreen}
          options={{
            headerShown: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="CaretakerAlert"
          component={CaretakerAlertScreen}
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <Stack.Screen name="Found" options={{ title: "" }}>
          {() => (
            <PlaceholderScreen
              title="Object found!"
              description="Spoken guidance and object details will appear here."
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Awareness" options={{ title: "Around you" }}>
          {() => (
            <PlaceholderScreen
              title="What's around you"
              description="Potential obstacle warnings will appear here."
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Help" options={{ title: "Get help" }}>
          {() => (
            <PlaceholderScreen
              title="Get help"
              description="Pair with a caregiver on the People tab so this button can call them."
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
