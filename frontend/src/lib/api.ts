import { useCallback } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useAuth } from "@clerk/expo";

/**
 * Where the FastAPI backend lives.
 *
 * Set EXPO_PUBLIC_API_URL in frontend/.env to override. Otherwise we guess:
 * - web: same computer, port 8000
 * - phone (Expo Go): the computer running `npx expo start`, port 8000
 */
function guessApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  const host = Constants.expoConfig?.hostUri?.split(":")[0]; // e.g. "192.168.1.5"
  return `http://${host ?? "localhost"}:8000`;
}

export const API_URL = guessApiUrl();

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Role = "patient" | "caretaker";

export type User = {
  id: number;
  email: string;
  phone_number: string | null;
  role: Role;
  clerk_id: string | null;
  created_at: string;
};

/** Returns a fetch helper that adds the signed-in user's Clerk token. */
export function useApi() {
  const { getToken } = useAuth();

  return useCallback(
    async <T = unknown>(method: string, path: string, body?: unknown): Promise<T> => {
      const token = await getToken();
      let res: Response;
      try {
        res = await fetch(`${API_URL}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body !== undefined && { "Content-Type": "application/json" }),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        throw new ApiError(0, `Can't reach the server at ${API_URL}. Is the backend running?`);
      }
      if (res.status === 204) return undefined as T;
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = data?.detail;
        const message =
          typeof detail === "string" ? detail : Array.isArray(detail) ? detail[0]?.msg : res.statusText;
        throw new ApiError(res.status, message || `Request failed (${res.status})`);
      }
      return data as T;
    },
    [getToken],
  );
}
