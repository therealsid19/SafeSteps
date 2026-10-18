import { defineConfig } from "drizzle-kit";

import { env } from "./src/config/env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: env.DATABASE_URL },
  // Only manage our own tables. Tiger installs extensions (pg_stat_statements,
  // pg_buffercache, timescaledb) into `public`, and push would try to drop their views.
  // Add new tables here when you add them to src/db/schema.ts.
  tablesFilter: ["user", "session", "account", "verification", "care_links", "patient_location"],
});
