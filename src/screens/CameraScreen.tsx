
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
import {
  CameraView,
  useCameraPermissions,
} from "expo-camera";
import {
  Camera,
  Search,
  X,
  ScanSearch,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";

import { COLORS } from "../constants/theme";

export default function CameraScreen() {
  const navigation = useNavigation();

  const [permission, requestPermission] =
    useCameraPermissions();

  const [targetObject, setTargetObject] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Camera permissions are still loading
  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
        />
      </View>
    );
  }

  // Camera permission has not been granted
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Camera size={64} color={COLORS.cyan} />

        <Text style={styles.permissionTitle}>
          Camera access needed
        </Text>

        <Text style={styles.permissionDescription}>
          SafeStep uses your camera to help locate
          everyday objects.
        </Text>

        <Pressable
          style={styles.permissionButton}
          accessibilityRole="button"
          onPress={requestPermission}
        >
          <Text style={styles.buttonText}>
            Allow Camera Access
          </Text>
        </Pressable>
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
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
      />

      {/* Dark overlay at the top */}
      <View style={styles.topOverlay}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.closeButton}
        >
          <X size={26} color="#FFFFFF" />
        </Pressable>

        <Text style={styles.headerTitle}>
          Find an Object
        </Text>
      </View>

      {/* Camera guide */}
      <View
        style={styles.scanArea}
        pointerEvents="none"
      >
        <View style={styles.scanFrame}>
          <ScanSearch
            size={58}
            color="rgba(255,255,255,0.7)"
          />
        </View>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomPanel}>
        <Text style={styles.panelTitle}>
          What are you looking for?
        </Text>

        <View style={styles.inputContainer}>
          <Search size={22} color={COLORS.muted} />

          <TextInput
            style={styles.input}
            value={targetObject}
            onChangeText={(text) => {
              setTargetObject(text);
              setIsSearching(false);
            }}
            placeholder="e.g. keys, water bottle"
            placeholderTextColor={COLORS.muted}
            accessibilityLabel="Object to find"
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
        </View>

        <Pressable
          style={[
            styles.searchButton,
            !targetObject.trim() && styles.disabledButton,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start object search"
          accessibilityState={{
            disabled: !targetObject.trim(),
          }}
          disabled={!targetObject.trim()}
          onPress={handleSearch}
        >
          <Search size={22} color="#FFFFFF" />

          <Text style={styles.buttonText}>
            {isSearching ? "Search requested" : "Start searching"}
          </Text>
        </Pressable>

        <Text style={styles.statusText}>
          {isSearching
            ? `Ready to search for "${targetObject.trim()}". Object detection is not connected yet.`
            : "Enter an object name to begin."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 20,
  },
  permissionTitle: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
  },
  permissionDescription: {
    color: COLORS.muted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  permissionButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 26,
    paddingVertical: 16,
    borderRadius: 16,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  topOverlay: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "rgba(9,14,23,0.75)",
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "700",
  },
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
    borderWidth: 2,
    borderColor: "rgba(83,181,255,0.8)",
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomPanel: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  panelTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 18,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 56,
    gap: 12,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    paddingVertical: 12,
    outlineStyle: "none",
  } as any,
  searchButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  disabledButton: {
    opacity: 0.5,
  },
  statusText: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 16,
  },
});
