
import { useCallback } from "react";

import {
  useApi,
  type PartnerLocationResponse,
  type LocationSharingResponse,
  type PatientCoordinates,
} from "./api";

export function usePatientLocation() {
  const api = useApi();

  const enableSharing = useCallback(
    () =>
      api<LocationSharingResponse>(
        "PUT",
        "/location/sharing",
        { enabled: true }
      ),
    [api]
  );

  const disableSharing = useCallback(
    () =>
      api<LocationSharingResponse>(
        "PUT",
        "/location/sharing",
        { enabled: false }
      ),
    [api]
  );

  const saveLocation = useCallback(
    (location: {
      latitude: number;
      longitude: number;
      accuracy: number | null;
    }) =>
      api<PatientCoordinates>(
        "PUT",
        "/location/me",
        location
      ),
    [api]
  );

  const getPartnerLocation = useCallback(
    () =>
      api<PartnerLocationResponse>(
        "GET",
        "/location/partner"
      ),
    [api]
  );

  return {
    enableSharing,
    disableSharing,
    saveLocation,
    getPartnerLocation,
  };
}
