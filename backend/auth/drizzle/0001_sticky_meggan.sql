-- Existing incidents get a random id; new ones must send their own.
ALTER TABLE "fall_incidents" ADD COLUMN "client_alert_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "fall_incidents" ALTER COLUMN "client_alert_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "fall_incidents" ADD CONSTRAINT "fall_incidents_client_alert_id_unique" UNIQUE("client_alert_id");
