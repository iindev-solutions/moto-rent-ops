CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"agreement_id" uuid,
	"type" varchar(32) DEFAULT 'cash' NOT NULL,
	"status" varchar(16) DEFAULT 'held' NOT NULL,
	"amount_minor" bigint,
	"currency" varchar(8) DEFAULT 'VND' NOT NULL,
	"document_custody_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"returned_at" timestamp with time zone,
	"applied_obligation_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(80) NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_hash" varchar(128) NOT NULL,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"agreement_id" uuid,
	"rental_item_id" uuid,
	"type" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'planned' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(8) DEFAULT 'VND' NOT NULL,
	"due_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(8) DEFAULT 'VND' NOT NULL,
	"method" varchar(32) DEFAULT 'cash' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_obligation_id_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_agreement_id_rental_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."rental_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_document_custody_id_document_custodies_id_fk" FOREIGN KEY ("document_custody_id") REFERENCES "public"."document_custodies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_applied_obligation_id_obligations_id_fk" FOREIGN KEY ("applied_obligation_id") REFERENCES "public"."obligations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_agreement_id_rental_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."rental_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_rental_item_id_rental_items_id_fk" FOREIGN KEY ("rental_item_id") REFERENCES "public"."rental_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "allocations_receipt_idx" ON "allocations" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "allocations_obligation_idx" ON "allocations" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "deposits_client_idx" ON "deposits" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "deposits_status_idx" ON "deposits" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope_key_uidx" ON "idempotency_records" USING btree ("scope","idempotency_key");--> statement-breakpoint
CREATE INDEX "obligations_client_idx" ON "obligations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "obligations_agreement_idx" ON "obligations" USING btree ("agreement_id");--> statement-breakpoint
CREATE INDEX "obligations_status_idx" ON "obligations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "receipts_client_idx" ON "receipts" USING btree ("client_id");