import {
  index,
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

// Each patient has at most one caretaker (patient_id is unique); a caretaker can
// look after up to MAX_PATIENTS_PER_CARETAKER patients. The database can't express
// the cap, so POST /me/link enforces it in a transaction that locks the caretaker's
// user row (src/db/care-links.ts). That the two users have the right roles is
// checked by the route (src/routes/me.ts), not by the database or care-links.ts.
export const MAX_PATIENTS_PER_CARETAKER = 5;

export const careLinks = pgTable(
  "care_links",
  {
    patientId: text("patient_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    caretakerId: text("caretaker_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.patientId, t.caretakerId] }),
    index("care_links_caretaker_id_idx").on(t.caretakerId),
  ],
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
