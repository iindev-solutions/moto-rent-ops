CREATE TABLE "return_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rental_item_id" uuid NOT NULL,
	"motorcycle_id" uuid NOT NULL,
	"performed_by_user_id" uuid,
	"odometer" integer,
	"fuel_level" varchar(32),
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"damage_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "return_inspections" ADD CONSTRAINT "return_inspections_rental_item_id_rental_items_id_fk" FOREIGN KEY ("rental_item_id") REFERENCES "public"."rental_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_inspections" ADD CONSTRAINT "return_inspections_motorcycle_id_motorcycles_id_fk" FOREIGN KEY ("motorcycle_id") REFERENCES "public"."motorcycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_inspections" ADD CONSTRAINT "return_inspections_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "return_inspections_rental_item_idx" ON "return_inspections" USING btree ("rental_item_id");--> statement-breakpoint
CREATE INDEX "return_inspections_motorcycle_idx" ON "return_inspections" USING btree ("motorcycle_id");