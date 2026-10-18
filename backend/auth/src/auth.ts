import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { eq } from "drizzle-orm";

import { env } from "./config/env";
import { db } from "./db";
import * as schema from "./db/schema";

// Lets Google read the phone number saved on the user's Google account (if any).
// Needs the People API enabled in your Google Cloud project.
const PHONE_SCOPE = "https://www.googleapis.com/auth/user.phonenumbers.read";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  // While developing, answer on both BETTER_AUTH_URL (e.g. an ngrok tunnel, for phones) and
  // localhost (for the web app). The web app must sign in through localhost: to the browser,
  // localhost:8081 -> ngrok is cross-site, so it drops the sign-in cookies ("state_mismatch").
  baseURL:
    env.NODE_ENV === "production"
      ? env.BETTER_AUTH_URL
      : {
          allowedHosts: [new URL(env.BETTER_AUTH_URL).host, `localhost:${env.PORT}`, `127.0.0.1:${env.PORT}`],
          fallback: env.BETTER_AUTH_URL,
        },
  // ngrok forwards https requests to us as http; trust its X-Forwarded-Proto/Host headers
  advanced: { trustedProxyHeaders: env.NODE_ENV !== "production" },
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [expo()],
  trustedOrigins: [
    ...env.TRUSTED_ORIGINS,
    `${env.APP_SCHEME}://`,
    // Expo Go deep links while developing
    ...(env.NODE_ENV !== "production" ? ["exp://", "exp://**", "exp://192.168.*.*:*/**"] : []),
  ],
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      prompt: "select_account",
      scope: [PHONE_SCOPE],
    },
  },
  user: {
    additionalFields: {
      // From Google when available, otherwise entered in the app (POST /me)
      phoneNumber: { type: "string", required: false, input: false },
      // null until the user picks one on the role screen
      role: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    account: {
      create: {
        // First Google sign-in: copy the phone number from their Google profile
        after: async (account) => {
          if (account.providerId !== "google" || !account.accessToken) return;
          const phone = await fetchGooglePhone(account.accessToken);
          if (phone) {
            await db.update(schema.user).set({ phoneNumber: phone }).where(eq(schema.user.id, account.userId));
          }
        },
      },
    },
  },
});

/** The primary phone number on the user's Google account, or null. */
async function fetchGooglePhone(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://people.googleapis.com/v1/people/me?personFields=phoneNumbers", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.warn("Google People API:", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as {
      phoneNumbers?: { value?: string; canonicalForm?: string; metadata?: { primary?: boolean } }[];
    };
    const phone = data.phoneNumbers?.find((p) => p.metadata?.primary) ?? data.phoneNumbers?.[0];
    return phone?.canonicalForm ?? phone?.value ?? null;
  } catch (e) {
    console.warn("Couldn't fetch Google phone number", e);
    return null;
  }
}
