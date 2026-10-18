// Applies ./drizzle migrations on startup (see Dockerfile). Used instead of
// `drizzle-kit migrate` because drizzle-kit hides the SQL error behind its spinner.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { env } from "../config/env";

// Host only, so the logs say which database this is without leaking credentials
const host = new URL(env.DATABASE_URL).host;
const client = postgres(env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

try {
  console.log(`Applying migrations to ${host}`);
  await migrate(drizzle(client), { migrationsFolder: `${import.meta.dir}/../../drizzle` });
  console.log("Migrations applied");
} catch (error) {
  console.error(`Migration failed on ${host}:`, error);
  process.exitCode = 1;
} finally {
  await client.end();
}
