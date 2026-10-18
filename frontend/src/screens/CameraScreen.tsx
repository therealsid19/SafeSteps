import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, Search, X, ScanSearch } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";

import { Button } from "../components/Form";
import { RADIUS, SPACING, TYPE } from "../constants/theme";
import { makeStyles, useTheme } from "../context/ThemeContext";

export default function CameraScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation();

  const [permission, requestPermission] = useCameraPermissions();

  const [targetObject, setTargetObject] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Camera permissions are still loading
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  // Camera permission has not been granted
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionIcon}>
          <Camera size={44} color={colors.onCard} />
        </View>
        <Text style={styles.permissionTitle} accessibilityRole="header">
          Camera access needed
        </Text>
        <Text style={styles.permissionDescription}>
          SafeStep uses your camera to help locate everyday objects.
        </Text>
        <View style={styles.permissionActions}>
          <Button title="Allow camera access" onPress={requestPermission} />
          <Button title="Not now" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  const handleSearch = () => {
    if (!targetObject.trim()) return;

    Keyboard.dismiss();
    setIsSearching(true);
  };

  return (
    <View style={styles.container}>
      {/* Live camera preview */}
      <CameraView style={StyleSheet.absoluteFill} facing="back" />

      <SafeAreaView edges={["top"]} style={styles.topOverlay}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.closeButton}
        >
          <X size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Find an object
        </Text>
      </SafeAreaView>

      {/* Camera guide */}
      <View style={styles.scanArea} pointerEvents="none">
        <View style={styles.scanFrame}>
          <ScanSearch size={58} color="rgba(255,255,255,0.75)" />
        </View>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomPanel}>
        <Text style={styles.panelTitle}>What are you looking for?</Text>

        <View style={styles.inputContainer}>
          <Search size={22} color={colors.muted} />
          <TextInput
            style={styles.input}
            value={targetObject}
            onChangeText={(text) => {
              setTargetObject(text);
              setIsSearching(false);
            }}
            placeholder="e.g. keys, water bottle"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Object to find"
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
        </View>

        <Button
          title={isSearching ? "Search requested" : "Start searching"}
          icon={Search}
          disabled={!targetObject.trim()}
          onPress={handleSearch}
        />

        <Text style={styles.statusText} accessibilityLiveRegion="polite">
          {isSearching
            ? `Ready to search for "${targetObject.trim()}". Object detection is not connected yet.`
            : "Enter an object name to begin."}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center: {
      flex: 1,
      backgroundColor: c.background,
      justifyContent: "center",
      alignItems: "center",
    },
    permissionContainer: {
      flex: 1,
      backgroundColor: c.background,
      justifyContent: "center",
      padding: 24,
      gap: SPACING.md,
    },
    permissionIcon: {
      width: 88,
      height: 88,
      borderRadius: RADIUS.pill,
      backgroundColor: c.card,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.sm,
    },
    permissionTitle: { ...TYPE.headingL, color: c.text },
    permissionDescription: { ...TYPE.bodyL, color: c.muted },
    permissionActions: { marginTop: SPACING.sm },
    topOverlay: {
      paddingHorizontal: 16,
      paddingBottom: 14,
      backgroundColor: "rgba(26,25,23,0.82)",
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    closeButton: {
      width: 48,
      height: 48,
      borderRadius: RADIUS.pill,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { ...TYPE.titleL, color: c.text },
    scanArea: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 35,
    },
    scanFrame: {
      width: "100%",
      maxWidth: 350,
      aspectRatio: 1,
      borderWidth: 3,
      borderColor: c.card,
      borderRadius: RADIUS.xl,
      alignItems: "center",
      justifyContent: "center",
    },
    bottomPanel: {
      backgroundColor: c.background,
      paddingHorizontal: 20,
      paddingTop: SPACING.lg,
      paddingBottom: 40,
      borderTopLeftRadius: RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
    },
    panelTitle: { ...TYPE.headingM, color: c.text, marginBottom: SPACING.md },
    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 20,
      minHeight: 58,
      gap: 12,
    },
    input: {
      ...TYPE.bodyL,
      flex: 1,
      color: c.text,
      paddingVertical: 12,
      outlineStyle: "none",
    } as any,
    statusText: {
      ...TYPE.bodyM,
      color: c.muted,
      textAlign: "center",
      marginTop: SPACING.md,
    },
  }),
);
