
import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";

import { usePatientLocation } from "./usePatientLocation";
import type { PartnerLocationResponse } from "./api";

export function usePartnerLocation() {
  const { getPartnerLocation } = usePatientLocation();

  const [data, setData] =
    useState<PartnerLocationResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await getPartnerLocation();
      setData(result);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load location"
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [getPartnerLocation]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void refresh();

      const interval = setInterval(() => {
        void refresh();
      }, 30000);

      return () => clearInterval(interval);
    }, [refresh])
  );

  return { data, loading, error, refresh };
}
