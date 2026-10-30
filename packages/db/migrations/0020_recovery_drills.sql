CREATE TABLE "recovery_drill_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"scope" varchar(120) NOT NULL,
	"expected_count" integer NOT NULL,
	"actual_count" integer NOT NULL,
	"expected_total_minor" bigint,
	"actual_total_minor" bigint,
	"currency" varchar(8),
	"status" varchar(16) NOT NULL,
	"mismatch_code" varchar(64),
	CONSTRAINT "recovery_drill_scopes_status_chk" CHECK ("recovery_drill_scopes"."status" IN ('passed', 'failed')),
	CONSTRAINT "recovery_drill_scopes_counts_chk" CHECK ("recovery_drill_scopes"."expected_count" >= 0 AND "recovery_drill_scopes"."actual_count" >= 0),
	CONSTRAINT "recovery_drill_scopes_totals_chk" CHECK (("recovery_drill_scopes"."expected_total_minor" IS NULL AND "recovery_drill_scopes"."actual_total_minor" IS NULL AND "recovery_drill_scopes"."currency" IS NULL) OR ("recovery_drill_scopes"."expected_total_minor" IS NOT NULL AND "recovery_drill_scopes"."actual_total_minor" IS NOT NULL AND "recovery_drill_scopes"."currency" IS NOT NULL)),
	CONSTRAINT "recovery_drill_scopes_mismatch_chk" CHECK (("recovery_drill_scopes"."status" = 'failed' AND "recovery_drill_scopes"."mismatch_code" IS NOT NULL) OR ("recovery_drill_scopes"."status" = 'passed' AND "recovery_drill_scopes"."mismatch_code" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "recovery_drills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"target_environment" varchar(32) NOT NULL,
	"artifact_ref" varchar(240) NOT NULL,
	"manifest_checksum" varchar(80),
	"status" varchar(16) DEFAULT 'running' NOT NULL,
	"failure_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_drills_status_chk" CHECK ("recovery_drills"."status" IN ('running', 'passed', 'failed')),
	CONSTRAINT "recovery_drills_terminal_chk" CHECK ("recovery_drills"."status" = 'running' OR ("recovery_drills"."finished_at" IS NOT NULL AND ("recovery_drills"."status" = 'failed' OR "recovery_drills"."manifest_checksum" IS NOT NULL))),
	CONSTRAINT "recovery_drills_failure_code_chk" CHECK (("recovery_drills"."status" = 'failed' AND "recovery_drills"."failure_code" IS NOT NULL) OR ("recovery_drills"."status" <> 'failed' AND "recovery_drills"."failure_code" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "recovery_drill_scopes" ADD CONSTRAINT "recovery_drill_scopes_drill_id_recovery_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."recovery_drills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_drills" ADD CONSTRAINT "recovery_drills_operator_user_id_users_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recovery_drill_scopes_drill_scope_uidx" ON "recovery_drill_scopes" USING btree ("drill_id","scope");--> statement-breakpoint
CREATE INDEX "recovery_drill_scopes_drill_idx" ON "recovery_drill_scopes" USING btree ("drill_id");--> statement-breakpoint
CREATE INDEX "recovery_drills_operator_idx" ON "recovery_drills" USING btree ("operator_user_id");--> statement-breakpoint
CREATE INDEX "recovery_drills_status_finished_idx" ON "recovery_drills" USING btree ("status","finished_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION recovery_drills_enforce_transition() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'recovery_drills is append-only: deletion is not allowed';
	END IF;
	IF OLD.status <> 'running' THEN
		RAISE EXCEPTION 'terminal recovery_drills rows are immutable';
	END IF;
	IF NEW.status NOT IN ('passed', 'failed') THEN
		RAISE EXCEPTION 'recovery_drills can only transition from running to passed or failed';
	END IF;
	IF NEW.operator_user_id <> OLD.operator_user_id
		OR NEW.started_at <> OLD.started_at
		OR NEW.target_environment <> OLD.target_environment
		OR NEW.artifact_ref <> OLD.artifact_ref
		OR NEW.created_at <> OLD.created_at THEN
		RAISE EXCEPTION 'recovery_drills identity fields are immutable';
	END IF;
	IF NEW.finished_at IS NULL OR (NEW.status = 'passed' AND NEW.manifest_checksum IS NULL) THEN
		RAISE EXCEPTION 'terminal recovery_drills rows require finished_at and a passed manifest checksum';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER recovery_drills_transition_guard
BEFORE UPDATE OR DELETE ON "recovery_drills"
FOR EACH ROW EXECUTE FUNCTION recovery_drills_enforce_transition();--> statement-breakpoint
CREATE OR REPLACE FUNCTION recovery_drill_scopes_reject_change() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'recovery_drill_scopes is append-only: rows cannot be changed or deleted';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER recovery_drill_scopes_immutable_guard
BEFORE UPDATE OR DELETE ON "recovery_drill_scopes"
FOR EACH ROW EXECUTE FUNCTION recovery_drill_scopes_reject_change();