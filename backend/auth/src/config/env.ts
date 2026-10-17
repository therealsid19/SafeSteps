// Bun loads .env by itself; this covers CLIs that run on Node (drizzle-kit, the Better Auth CLI)
import "dotenv/config";
import z from "zod";

/** "a, b,c" -> ["a", "b", "c"] */
const commaList = z
  .string()
  .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8000),

  // Tiger Data connection string (TIMESCALE_SERVICE_URL from your Tiger credentials file)
  DATABASE_URL: z.url(),

  BETTER_AUTH_SECRET: z.string().min(32, "generate one with: openssl rand -base64 32"),
  // Public URL of this server; Google redirects to $BETTER_AUTH_URL/api/auth/callback/google
  BETTER_AUTH_URL: z.url(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  // Browser origins allowed to call the API (8081 = the Expo app in a browser)
  TRUSTED_ORIGINS: commaList.default(["http://localhost:8081", "http://127.0.0.1:8081"]),
  // Deep link scheme of the app (frontend/app.json "scheme")
  APP_SCHEME: z.string().min(1).default("safestep"),
});

const createEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(`Invalid environment variables (check backend/auth/.env):\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }

  return result.data;
};

export const env = createEnv();
