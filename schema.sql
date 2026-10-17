-- Run with:  psql "$DATABASE_URL" -f schema.sql

-- Role enum (created only if it doesn't exist yet)
DO $$
BEGIN
    CREATE TYPE user_role AS ENUM ('patient', 'caretaker');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id           BIGSERIAL PRIMARY KEY,
    email        TEXT        NOT NULL UNIQUE,
    phone_number TEXT,
    role         user_role   NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, role)          -- lets care_links check roles via foreign keys
);

-- Clerk user id (user_xxx). Added separately so existing tables get it too.
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id TEXT UNIQUE;

-- 1-to-1 mapping: each patient has at most one caretaker and vice versa.
-- The *_role columns are pinned to a fixed value, and the composite foreign
-- keys make the database reject e.g. a caretaker in the patient slot.
CREATE TABLE IF NOT EXISTS care_links (
    patient_id     BIGINT    NOT NULL UNIQUE,
    patient_role   user_role NOT NULL DEFAULT 'patient'   CHECK (patient_role = 'patient'),
    caretaker_id   BIGINT    NOT NULL UNIQUE,
    caretaker_role user_role NOT NULL DEFAULT 'caretaker' CHECK (caretaker_role = 'caretaker'),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (patient_id, caretaker_id),
    FOREIGN KEY (patient_id, patient_role)     REFERENCES users (id, role) ON DELETE CASCADE,
    FOREIGN KEY (caretaker_id, caretaker_role) REFERENCES users (id, role) ON DELETE CASCADE
);