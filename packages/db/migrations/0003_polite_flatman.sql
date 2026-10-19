CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"channel" varchar(32) NOT NULL,
	"value" varchar(240) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"preferred_channel" varchar(32) DEFAULT 'phone' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_custodies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"document_type" varchar(64) NOT NULL,
	"masked_number" varchar(64),
	"status" varchar(16) DEFAULT 'held' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"returned_at" timestamp with time zone,
	"received_by_user_id" uuid,
	"returned_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rental_item_id" uuid,
	"motorcycle_id" uuid NOT NULL,
	"performed_by_user_id" uuid,
	"odometer" integer,
	"fuel_level" varchar(32),
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"damage_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"motorcycle_id" uuid NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"daily_rate_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'VND' NOT NULL,
	"status" varchar(32) DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_custodies" ADD CONSTRAINT "document_custodies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_custodies" ADD CONSTRAINT "document_custodies_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_custodies" ADD CONSTRAINT "document_custodies_returned_by_user_id_users_id_fk" FOREIGN KEY ("returned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_rental_item_id_rental_items_id_fk" FOREIGN KEY ("rental_item_id") REFERENCES "public"."rental_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_motorcycle_id_motorcycles_id_fk" FOREIGN KEY ("motorcycle_id") REFERENCES "public"."motorcycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreements" ADD CONSTRAINT "rental_agreements_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_agreement_id_rental_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."rental_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_motorcycle_id_motorcycles_id_fk" FOREIGN KEY ("motorcycle_id") REFERENCES "public"."motorcycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_contacts_client_channel_value_uidx" ON "client_contacts" USING btree ("client_id","channel","value");--> statement-breakpoint
CREATE INDEX "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "clients_name_idx" ON "clients" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "document_custodies_client_idx" ON "document_custodies" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "document_custodies_status_idx" ON "document_custodies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "handovers_motorcycle_idx" ON "handovers" USING btree ("motorcycle_id");--> statement-breakpoint
CREATE INDEX "handovers_rental_item_idx" ON "handovers" USING btree ("rental_item_id");--> statement-breakpoint
CREATE INDEX "rental_agreements_client_idx" ON "rental_agreements" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "rental_agreements_status_idx" ON "rental_agreements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rental_items_agreement_idx" ON "rental_items" USING btree ("agreement_id");--> statement-breakpoint
CREATE INDEX "rental_items_motorcycle_idx" ON "rental_items" USING btree ("motorcycle_id");