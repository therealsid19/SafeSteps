// JS side of the native ARKit module (ios/). On phones without LiDAR (or Android, web,
// or an app built before this module existed) `arSupported` is false and nothing native is loaded.
import type { ComponentType } from "react";
import { Platform, type NativeSyntheticEvent, type ViewProps } from "react-native";
import { requireNativeView, requireOptionalNativeModule } from "expo";

/** Sent ~12 times a second. Distances in metres along the floor. */
export interface HazardEvent {
  dist: number;        // nearest thing in the path; 99 = clear
  label: string;       // its name, "wall", "low obstacle", or "" (unknown)
  left: string;        // "" = nothing close on that side
  right: string;
  drop: number;        // where the floor drops away; -1 = no drop-off
  phoneHeight: number; // measured phone height above the floor
  floorFound: boolean; // ARKit found the floor plane (drop-offs only work then)
  tracking: string;    // "normal", "starting", "moving too fast", ...
  ms: number;          // time for this hazard check
  detectorMs: number;  // time of the last object detection
}

/** box: 0..1 of the upright camera picture, top-left origin */
export interface ARObject {
  name: string;
  conf: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dist?: number;    // metres away (missing if LiDAR had no reading there)
  lateral?: number; // metres to the right (+) or left (-)
}

export interface SafeStepARViewProps extends ViewProps {
  active: boolean;
  settings: Record<string, number>;
  classes: { names: string[]; important: string[]; minConf: number };
  onHazard?: (e: NativeSyntheticEvent<HazardEvent>) => void;
  onObjects?: (e: NativeSyntheticEvent<{ objects: ARObject[]; ms: number }>) => void;
  onStatus?: (e: NativeSyntheticEvent<{ message: string; error?: boolean }>) => void;
}

const native =
  Platform.OS === "ios" ? requireOptionalNativeModule<{ isSupported(): boolean }>("SafeStepAR") : null;

/** This phone has LiDAR and the app was built with the ARKit module. */
export const arSupported = !!native?.isSupported();

export const SafeStepARView: ComponentType<SafeStepARViewProps> | null = arSupported
  ? requireNativeView<SafeStepARViewProps>("SafeStepAR")
  : null;
