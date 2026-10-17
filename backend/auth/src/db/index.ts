import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../config/env";
import * as schema from "./schema";

const client = postgres(env.DATABASE_URL, {
  // Tiger's connection pooler runs in transaction mode, which can't use prepared statements
  prepare: false,
});

export const db = drizzle(client, { schema });
