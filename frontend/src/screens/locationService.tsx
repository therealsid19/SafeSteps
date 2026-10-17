
import * as Location from "expo-location";

export async function requestPatientLocation() {
  const servicesEnabled =
    await Location.hasServicesEnabledAsync();

  if (!servicesEnabled) {
    throw new Error(
      "Location Services are disabled on this device."
    );
  }

  const { status } =
    await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    return null;
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp,
    };
  } catch (error) {
    console.warn("Fresh location unavailable:", error);

    const lastKnown =
      await Location.getLastKnownPositionAsync({
        maxAge: 5 * 60 * 1000,
      });

    if (!lastKnown) {
      throw new Error(
        "Unable to determine your location. Try moving outdoors or setting a simulator location."
      );
    }

    return {
      latitude: lastKnown.coords.latitude,
      longitude: lastKnown.coords.longitude,
      accuracy: lastKnown.coords.accuracy,
      timestamp: lastKnown.timestamp,
    };
  }
}
