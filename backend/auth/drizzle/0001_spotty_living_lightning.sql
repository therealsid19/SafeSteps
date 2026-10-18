ALTER TABLE "care_links" DROP CONSTRAINT "care_links_caretaker_id_unique";--> statement-breakpoint
CREATE INDEX "care_links_caretaker_id_idx" ON "care_links" USING btree ("caretaker_id");