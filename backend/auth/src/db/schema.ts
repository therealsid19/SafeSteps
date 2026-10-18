import {
  pgTable,
  primaryKey,
  text,
  timestamp,
  doublePrecision,
  boolean,
  pgEnum,
  uuid
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

export const fallReasonEnum = pgEnum("fall_reason", [
  "timeout",
  "help",
  "voice_error",
]);

export const fallCallStatusEnum = pgEnum("fall_call_status", [
  "pending",
  "initiated",
  "answered",
  "failed",
]);

export const fallVerificationEnum = pgEnum(
  "fall_verification",
  [
    "unverified",
    "confirmed",
    "false_alarm",
    "unable_to_verify",
  ],
);


export const pushTokens = pgTable("push_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  token: text("token").notNull().unique(),

  platform: text("platform").notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  }).defaultNow().notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  }).defaultNow().notNull(),
});

export const fallAlertStatusEnum = pgEnum("fall_alert_status", [
  "pending",
  "sent",
  "acknowledged",
  "failed",
]);

export const fallIncidents = pgTable("fall_incidents", {
  id: uuid("id").defaultRandom().primaryKey(),

  patientId: text("patient_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  caretakerId: text("caretaker_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  detectedAt: timestamp("detected_at", {
    withTimezone: true,
  }).notNull(),

  escalatedAt: timestamp("escalated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  reason: fallReasonEnum("reason").notNull(),

  alertStatus: fallAlertStatusEnum("alert_status")
    .default("pending")
    .notNull(),

  acknowledgedAt: timestamp("acknowledged_at", {
    withTimezone: true,
  }),

  verification: fallVerificationEnum("verification")
    .default("unverified")
    .notNull(),

  verifiedAt: timestamp("verified_at", {
    withTimezone: true,
  }),
});