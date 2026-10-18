import { useCallback } from "react";
import { Platform } from "react-native";

import { authClient } from "./auth-client";
import { API_URL } from "./config";

export { API_URL };

const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Role = "patient" | "caretaker";

export type User = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  phone_number: string | null;
  role: Role;
  created_at: string;
};


export type PatientCoordinates = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recorded_at: string;
};

export type PartnerLocationResponse = {
  sharing_enabled: boolean;
  location: PatientCoordinates | null;
};

export type LocationSharingResponse = {
  sharing_enabled: boolean;
};


/** Returns a fetch helper that sends the signed-in user's Better Auth session cookie. */
export function useApi() {
  return useCallback(
    async <T = unknown>(method: string, path: string, body?: unknown): Promise<T> => {
      // Native keeps the session cookie in SecureStore (not available on web, where the browser has it)
      const cookie = Platform.OS === "web" ? null : await authClient.getCookie();
      let res: Response;
      // A request that hangs must fail, so callers (like the fall alert retry loop) can react
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        res = await fetch(`${API_URL}${path}`, {
          signal: controller.signal,
          method,
          headers: {
            ...(cookie && { Cookie: cookie }),
            ...(body !== undefined && { "Content-Type": "application/json" }),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          // Native: we set the cookie ourselves. Web: the browser sends it (needs "include").
          credentials: Platform.OS === "web" ? "include" : "omit",
        });
      } catch {
        throw new ApiError(0, `Can't reach the server at ${API_URL}. Is the backend running?`);
      } finally {
        clearTimeout(timeout);
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
    [],
  );
}
