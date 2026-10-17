import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

// Better Auth's tables (user, session, account, verification).
// Regenerate with `bun run auth:generate` after changing src/auth.ts.
export * from "./auth-schema";

export type Role = "patient" | "caretaker";

// 1-to-1 pairing: each patient has at most one caretaker and vice versa.
// That the roles are right is checked by the API (src/routes/me.ts).
export const careLinks = pgTable(
  "care_links",
  {
    patientId: text("patient_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    caretakerId: text("caretaker_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.patientId, t.caretakerId] })],
);
