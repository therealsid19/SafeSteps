import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Keyboard,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Camera as CameraPreview, useCameraDevice, useCameraPermission } from "react-native-vision-camera";
import { Camera, Search, X, ScanSearch, Footprints } from "lucide-react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";

import { Button } from "../components/Form";
import { DetectionOverlay } from "../components/DetectionOverlay";
import { FINDABLE, useDetection, type DetectionMode } from "../detection/useDetection";
import { RADIUS, SPACING, TYPE } from "../constants/theme";
import { makeStyles, useTheme } from "../context/ThemeContext";

export default function CameraScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const navigation = useNavigation();

  const { hasPermission, requestPermission } = useCameraPermission();
  // prefer the LiDAR camera (iPhone Pro): wide camera + laser depth. Other phones get their normal back camera.
  const device = useCameraDevice("back", { physicalDevices: ["lidar-depth"] });
  const hasLidar =
    !!device && (device.type === "lidar-depth" || device.physicalDevices.some((p) => p.type === "lidar-depth"));
  const isFocused = useIsFocused(); // only run the camera while this screen is visible
  const [cameraReady, setCameraReady] = useState(false);

  const [mode, setMode] = useState<DetectionMode>("guide");
  const [targetObject, setTargetObject] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const target = targetObject.trim().toLowerCase();
  const findable = FINDABLE.includes(target);
  const detecting =
    hasPermission && isFocused && cameraReady && (mode === "guide" || (isSearching && findable));
  const { frameOutput, depthOutput, status, error, info, message } = useDetection({
    enabled: detecting,
    mode,
    target,
    lidar: hasLidar,
  });

  // Back camera not found yet
  if (hasPermission && !device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  // Camera permission has not been granted
  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionIcon}>
          <Camera size={44} color={colors.onCard} />
        </View>
        <Text style={styles.permissionTitle} accessibilityRole="header">
          Camera access needed
        </Text>
        <Text style={styles.permissionDescription}>
          SafeStep uses your camera to warn you about obstacles and help locate everyday objects.
        </Text>
        <View style={styles.permissionActions}>
          <Button title="Allow camera access" onPress={requestPermission} />
          <Button title="Not now" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  const handleSearch = () => {
    if (!target) return;

    Keyboard.dismiss();
    setIsSearching(true);
  };

  const pickTarget = (name: string) => {
    setTargetObject(name);
    setIsSearching(false);
  };

  let statusText: string;
  if (status === "error") {
    statusText = error ?? "Object detection stopped working.";
  } else if (status === "loading") {
    statusText = "Starting object detection…";
  } else if (mode === "guide") {
    statusText = message ?? "Hold your phone upright at chest height. Path looks clear.";
  } else if (!target) {
    statusText = "Enter or pick an object to begin.";
  } else if (!findable) {
    statusText = `SafeStep can't recognize "${targetObject.trim()}" yet. Pick one of the objects above.`;
  } else if (!isSearching) {
    statusText = `Ready to search for ${target}.`;
  } else {
    statusText = message ?? `Looking for ${target}. Slowly sweep your phone around.`;
  }

  return (
    <View style={styles.container}>
      {/* Live camera preview */}
      {device ? (
        <CameraPreview
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused}
          outputs={hasLidar ? [frameOutput, depthOutput] : [frameOutput]}
          resizeMode="cover"
          onStarted={() => setCameraReady(true)}
          onStopped={() => setCameraReady(false)} // e.g. after leaving the screen; detection waits for a restart
          onError={(e) => console.warn("Camera error", e)}
        />
      ) : null}

      {detecting && info ? (
        <DetectionOverlay info={info} highlight={mode === "find" ? target : undefined} />
      ) : null}

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
          {mode === "guide" ? "Walking guide" : "Find an object"}
        </Text>
      </SafeAreaView>

      {/* Camera guide */}
      <View style={styles.scanArea} pointerEvents="none">
        {!detecting && mode === "find" ? (
          <View style={styles.scanFrame}>
            <ScanSearch size={58} color="rgba(255,255,255,0.75)" />
          </View>
        ) : null}
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomPanel}>
        <View style={styles.modeSwitch} accessibilityRole="tablist">
          {(
            [
              { key: "guide", label: "Guide", icon: Footprints },
              { key: "find", label: "Find", icon: Search },
            ] as const
          ).map(({ key, label, icon: Icon }) => {
            const selected = mode === key;
            const fg = selected ? colors.onPrimary : colors.text;
            return (
              <Pressable
                key={key}
                onPress={() => setMode(key)}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                style={[styles.modeButton, selected && styles.modeButtonSelected]}
              >
                <Icon size={20} color={fg} />
                <Text style={[styles.modeLabel, { color: fg }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {mode === "find" ? (
          <>
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
                placeholder="e.g. chair, door"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Object to find"
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={handleSearch}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              keyboardShouldPersistTaps="handled"
            >
              {FINDABLE.map((name) => (
                <Pressable
                  key={name}
                  onPress={() => pickTarget(name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Find ${name}`}
                  accessibilityState={{ selected: name === target }}
                  style={[styles.chip, name === target && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, name === target && styles.chipTextSelected]}>
                    {name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <Button
              title={isSearching ? "Stop searching" : "Start searching"}
              icon={isSearching ? X : Search}
              disabled={!findable}
              onPress={isSearching ? () => setIsSearching(false) : handleSearch}
            />
          </>
        ) : null}

        <Text style={styles.statusText} accessibilityLiveRegion="polite">
          {statusText}
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
    modeSwitch: {
      flexDirection: "row",
      backgroundColor: c.surface,
      borderRadius: RADIUS.pill,
      padding: SPACING.xs,
      marginBottom: SPACING.md,
    },
    modeButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: RADIUS.pill,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: SPACING.sm,
    },
    modeButtonSelected: { backgroundColor: c.primary },
    modeLabel: { ...TYPE.titleM },
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
    chips: { gap: SPACING.sm, paddingVertical: SPACING.md },
    chip: {
      minHeight: 40,
      justifyContent: "center",
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.pill,
      backgroundColor: c.surfaceAlt,
    },
    chipSelected: { backgroundColor: c.accent },
    chipText: { ...TYPE.bodyM, color: c.text },
    chipTextSelected: { color: c.onAccent },
    statusText: {
      ...TYPE.bodyM,
      color: c.muted,
      textAlign: "center",
      marginTop: SPACING.md,
    },
  }),
);