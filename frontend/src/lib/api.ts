import { useCallback } from "react";
import { Platform } from "react-native";

import { authClient } from "./auth-client";
import { API_URL } from "./config";

export { API_URL };

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

/** Returns a fetch helper that sends the signed-in user's Better Auth session cookie. */
export function useApi() {
  return useCallback(
    async <T = unknown>(method: string, path: string, body?: unknown): Promise<T> => {
      const cookie = await authClient.getCookie();
      let res: Response;
      try {
        res = await fetch(`${API_URL}${path}`, {
          method,
          headers: {
            Cookie: cookie,
            ...(body !== undefined && { "Content-Type": "application/json" }),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          // Native: we set the cookie ourselves. Web: the browser sends it (needs "include").
          credentials: Platform.OS === "web" ? "include" : "omit",
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
    [],
  );
}
