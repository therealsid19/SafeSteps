
import { useEffect, useRef } from "react";
import { Accelerometer, Gyroscope } from "expo-sensors";

type FallDetectionOptions = {
  enabled: boolean;
  onFallDetected: () => void;
};

// Experimental values for controlled testing only.
const ACCELERATION_THRESHOLD = 2.5; // g
const ROTATION_THRESHOLD = 2.5; // rad/s
const COOLDOWN_MS = 15000;
const SAMPLE_INTERVAL_MS = 50;

export function useFallDetection({
  enabled,
  onFallDetected,
}: FallDetectionOptions) {
  const callbackRef = useRef(onFallDetected);
  const lastTriggeredRef = useRef(0);
  const rotationRef = useRef(0);

  useEffect(() => {
    callbackRef.current = onFallDetected;
  }, [onFallDetected]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let accelerationSubscription:
      | ReturnType<typeof Accelerometer.addListener>
      | undefined;
    let rotationSubscription:
      | ReturnType<typeof Gyroscope.addListener>
      | undefined;

    async function subscribe() {
      const [hasAccelerometer, hasGyroscope] = await Promise.all([
        Accelerometer.isAvailableAsync(),
        Gyroscope.isAvailableAsync(),
      ]);

      if (!active) return;

      if (!hasAccelerometer || !hasGyroscope) {
        console.warn("Required motion sensors unavailable");
        return;
      }

      Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
      Gyroscope.setUpdateInterval(SAMPLE_INTERVAL_MS);

      rotationSubscription = Gyroscope.addListener(({ x, y, z }) => {
        rotationRef.current = Math.sqrt(x * x + y * y + z * z);
      });

      accelerationSubscription = Accelerometer.addListener(
        ({ x, y, z }) => {
          const acceleration = Math.sqrt(x * x + y * y + z * z);
          const rotation = rotationRef.current;
          const now = Date.now();

          if (
            acceleration > ACCELERATION_THRESHOLD &&
            rotation > ROTATION_THRESHOLD &&
            now - lastTriggeredRef.current > COOLDOWN_MS
          ) {
            lastTriggeredRef.current = now;

            console.log("Possible fall-like motion detected", {
              acceleration,
              rotation,
            });

            callbackRef.current();
          }
        }
      );
    }

    subscribe().catch((error) => {
      console.error("Motion detection setup failed:", error);
    });

    return () => {
      active = false;
      accelerationSubscription?.remove();
      rotationSubscription?.remove();
    };
  }, [enabled]);
}
