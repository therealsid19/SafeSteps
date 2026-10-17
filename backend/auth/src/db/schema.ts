import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  doublePrecision,
  boolean,
} from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.patientId, t.caretakerId] })],
);


export const patientLocation = pgTable("patient_location", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),

  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),

  accuracyM: doublePrecision("accuracy_m"),

  sharingEnabled: boolean("sharing_enabled")
    .default(false)
    .notNull(),

  recordedAt: timestamp("recorded_at", {
    withTimezone: true,
  }),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});
