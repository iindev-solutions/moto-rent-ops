CREATE TABLE "location_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"motorcycle_id" uuid NOT NULL,
	"location" varchar(120) NOT NULL,
	"note" text,
	"assigned_by_user_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_assignments_location_chk" CHECK (length(trim("location_assignments"."location")) > 0),
	CONSTRAINT "location_assignments_window_chk" CHECK ("location_assignments"."ended_at" IS NULL OR "location_assignments"."ended_at" >= "location_assignments"."started_at")
);
--> statement-breakpoint
ALTER TABLE "location_assignments" ADD CONSTRAINT "location_assignments_motorcycle_id_motorcycles_id_fk" FOREIGN KEY ("motorcycle_id") REFERENCES "public"."motorcycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_assignments" ADD CONSTRAINT "location_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_assignments_motorcycle_idx" ON "location_assignments" USING btree ("motorcycle_id","started_at");--> statement-breakpoint
INSERT INTO "location_assignments" ("motorcycle_id", "location", "note")
SELECT "id", "location", 'Backfilled from motorcycles.location' FROM "motorcycles"
WHERE "location" IS NOT NULL AND length(trim("location")) > 0;