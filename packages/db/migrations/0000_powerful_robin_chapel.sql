CREATE TABLE "motorcycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_code" varchar(32) NOT NULL,
	"model" varchar(120) NOT NULL,
	"plate" varchar(32),
	"status" varchar(32) DEFAULT 'available' NOT NULL,
	"location" varchar(120),
	"next_action" varchar(240),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motorcycle_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_payloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identity_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"token_ciphertext" text NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "qr_identities" ADD CONSTRAINT "qr_identities_motorcycle_id_motorcycles_id_fk" FOREIGN KEY ("motorcycle_id") REFERENCES "public"."motorcycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_payloads" ADD CONSTRAINT "qr_payloads_identity_id_qr_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."qr_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "motorcycles_asset_code_uidx" ON "motorcycles" USING btree ("asset_code");--> statement-breakpoint
CREATE INDEX "motorcycles_status_idx" ON "motorcycles" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_identities_motorcycle_uidx" ON "qr_identities" USING btree ("motorcycle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_payloads_token_hash_uidx" ON "qr_payloads" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "qr_payloads_identity_status_idx" ON "qr_payloads" USING btree ("identity_id","status");