import { Platform } from "react-native";

/**
 * Where the backend (backend/auth) lives.
 *
 * This must be exactly BETTER_AUTH_URL from backend/auth/.env: Google sign-in starts here
 * and Google redirects back to BETTER_AUTH_URL, and the browser only keeps the sign-in
 * cookie if both are the same host (otherwise you get "state_mismatch").
 *
 * Set EXPO_PUBLIC_API_URL in frontend/.env.local. Default: http://localhost:8000
 * (works on web and the iOS simulator; a real phone needs a tunnel like ngrok).
 */
function apiUrl(): string {
  // Web always talks to the backend on the same host (localhost:8000), even when
  // EXPO_PUBLIC_API_URL is a tunnel for phones: browsers drop cross-site sign-in cookies.
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (process.env.EXPO_PUBLIC_WEB_API_URL) return process.env.EXPO_PUBLIC_WEB_API_URL.replace(/\/$/, "");
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  return "http://localhost:8000";
}

export const API_URL = apiUrl();
