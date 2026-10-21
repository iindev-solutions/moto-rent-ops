ALTER TABLE "qr_payloads" ADD COLUMN "manual_code" varchar(16);--> statement-breakpoint
UPDATE "qr_payloads" SET "manual_code" = upper(substring(replace("id"::text, '-', '') from 1 for 10));--> statement-breakpoint
ALTER TABLE "qr_payloads" ALTER COLUMN "manual_code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "qr_payloads_manual_code_uidx" ON "qr_payloads" USING btree ("manual_code");