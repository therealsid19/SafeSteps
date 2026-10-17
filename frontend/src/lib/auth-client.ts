import { Platform } from "react-native";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

import { API_URL } from "./config";

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({ scheme: "safestep", storagePrefix: "safestep", storage: SecureStore }),
    // Matches user.additionalFields in backend/auth/src/auth.ts
    inferAdditionalFields({
      user: {
        phoneNumber: { type: "string", required: false, input: false },
        role: { type: "string", required: false, input: false },
      },
    }),
  ],
});

/** Opens Google's sign-in page. The session updates by itself when it finishes. */
export function signInWithGoogle() {
  return authClient.signIn.social({
    provider: "google",
    // Native: "/" becomes a safestep:// deep link back into the app.
    // Web: the page navigates away, so come back to this same page.
    callbackURL: Platform.OS === "web" ? window.location.origin : "/",
  });
}
