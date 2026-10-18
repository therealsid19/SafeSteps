import type { ComponentType } from "react";

declare const PatientMap: ComponentType<{
  latitude: number;
  longitude: number;
  preview?: boolean;
}>;

export default PatientMap;
