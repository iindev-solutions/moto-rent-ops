CREATE TABLE "rental_agreement_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" varchar(32) NOT NULL,
	"change_reason" varchar(32) NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"notes" text,
	"snapshot" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rental_agreement_versions_version_chk" CHECK ("rental_agreement_versions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "rental_agreement_versions" ADD CONSTRAINT "rental_agreement_versions_agreement_id_rental_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."rental_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreement_versions" ADD CONSTRAINT "rental_agreement_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rental_agreement_versions_agreement_version_uidx" ON "rental_agreement_versions" USING btree ("agreement_id","version");--> statement-breakpoint
CREATE INDEX "rental_agreement_versions_agreement_idx" ON "rental_agreement_versions" USING btree ("agreement_id");--> statement-breakpoint
INSERT INTO "rental_agreement_versions" ("agreement_id", "version", "status", "change_reason", "start_date", "end_date", "notes", "snapshot")
SELECT
	a."id",
	a."version",
	a."status",
	'created',
	a."start_date",
	a."end_date",
	a."notes",
	jsonb_build_object(
		'agreement', jsonb_build_object(
			'id', a."id",
			'clientId', a."client_id",
			'status', a."status",
			'startDate', to_jsonb(a."start_date"),
			'endDate', to_jsonb(a."end_date"),
			'notes', to_jsonb(a."notes")
		),
		'items', COALESCE((
			SELECT jsonb_agg(jsonb_build_object(
				'id', i."id",
				'motorcycleId', i."motorcycle_id",
				'startDate', to_jsonb(i."start_date"),
				'endDate', to_jsonb(i."end_date"),
				'dailyRateMinor', i."daily_rate_minor",
				'currency', i."currency",
				'status', i."status"
			) ORDER BY i."created_at")
			FROM "rental_items" i
			WHERE i."agreement_id" = a."id"
		), '[]'::jsonb)
	)
FROM "rental_agreements" a;