# Research: Backup and Restore Drill

**Feature**: `001-backup-restore-drill` | **Date**: 2026-10-28

## Decision 1: Provider-specific native backup

**Decision**: Use a `RecoveryProvider` interface with two implementations: a PGlite
data-directory snapshot for development/tests and `pg_dump`/`pg_restore` custom-format archives
for PostgreSQL in production.

**Rationale**: both engines already provide a consistency mechanism that understands their
storage format. Native tools avoid reimplementing 28 tables of export/import logic, foreign-key
ordering, and sequence handling. The interface keeps the drill orchestration identical in both
environments.

**Alternatives considered**:

- Logical JSONL export through Drizzle for every table. Rejected: high maintenance, easy to miss
  a table, and foreign-key/identity handling becomes custom code.
- Copying a live PostgreSQL data directory. Rejected: unsafe while the server is running and not
  portable across PostgreSQL versions.
- Using only `pg_dump` and skipping PGlite. Rejected: the test suite and local drill could not run
  without a PostgreSQL service.

## Decision 2: Document storage copied with a checksum manifest

**Decision**: copy every in-scope document object into the backup artifact, record its relative
path and SHA-256 checksum in the manifest, and re-hash after restore. List the source before and
after the copy; any object added or removed during the window fails the drill.

**Rationale**: database and object storage cannot share a transaction. Detecting changes during
the copy window is the simplest honest way to prove a consistent point-in-time set without
requiring bucket versioning or a maintenance window.

**Alternatives considered**:

- Rely on S3 bucket versioning. Rejected: versioning is not guaranteed in every deployment and
  does not by itself prove which version belongs to the database snapshot.
- Skip documents and back up only the database. Rejected: the pilot cannot recover without rental
  documents and custody evidence.
- Require a full maintenance window. Rejected: useful as an operational safeguard, but the drill
  should detect inconsistency rather than assume the operator stopped all writes.

## Decision 3: Explicit isolation guard

**Decision**: a restore requires `RECOVERY_TARGET_ENV=isolated`, a non-production runtime, and a
target fingerprint that differs from the configured production database and storage endpoints.
The command refuses to run when any check is missing or when the target matches production.

**Rationale**: the most dangerous failure mode is a correct restore into the wrong environment.
A single environment flag is easy to set by accident, so the guard combines an explicit marker
with an automatic comparison against the production configuration.

**Alternatives considered**:

- Ask for interactive confirmation only. Rejected: scripts and tired operators can confirm the
  wrong target.
- Rely on separate credentials. Rejected: credentials can be copied or misconfigured; the guard
  should fail closed even when credentials are valid.
- Disable the guard in development. Rejected: the drill path must be exercised exactly as it will
  run in production.

## Decision 4: Verification by counts and financial totals

**Decision**: after restore, compare per-scope row counts and financial totals per currency
against the manifest. A mismatch fails the drill and names the scope. Checksums prove artifact
integrity; counts and totals prove logical integrity.

**Rationale**: a valid archive can still restore the wrong logical state. Financial totals are the
domain's source of truth and catch truncation, duplication, and partial restores that row counts
alone can miss.

**Alternatives considered**:

- Compare only the archive checksum. Rejected: proves the file was not corrupted, not that the
  restored data is correct.
- Spot-check a few records. Rejected: not repeatable and easy to bias toward known-good rows.
- Full row-by-row diff. Rejected: slower and noisier; counts plus financial totals are sufficient
  for the pilot gate, with per-scope reporting for diagnosis.

## Decision 5: Append-only evidence in the database

**Decision**: store completed drills in `recovery_drills` with per-scope rows in
`recovery_drill_scopes`, and write an `audit_events` row when a drill completes. Terminal rows are
immutable; only a `running` row may transition to `passed` or `failed`.

**Rationale**: evidence must survive the machine that ran the drill and be visible to the owner
and auditor. The existing audit model already provides append-only review and role restrictions.

**Alternatives considered**:

- A JSON file next to the backup. Rejected: easy to lose, edit, or omit from review.
- An external issue tracker. Rejected: adds a dependency and splits the audit trail.
- Reusing only `audit_events`. Rejected: the structured per-scope verification is too large for a
  generic audit payload and would be hard to query.

## Decision 6: CLI for execution, read-only API and UI for evidence

**Decision**: run the drill from `npm run recovery:drill`; expose `GET /api/recovery/status`,
`GET /api/recovery/drills`, and `GET /api/recovery/drills/[id]` to owner/admin users, plus a
`/recovery` page. The UI does not start long-running drills in this version.

**Rationale**: a drill can run for tens of minutes and must not depend on an HTTP request or a
browser tab. The owner still needs a fast readiness answer and a reviewable evidence list.

**Alternatives considered**:

- Start drills from the UI. Rejected for v1: requires a job queue, progress streaming, and
  cancellation; the CLI plus the existing outbox worker pattern is enough for the pilot.
- CLI only. Rejected: the operator cannot check readiness without shell access.
- A separate worker service. Rejected: unnecessary for a scheduled operational drill.

## Decision 7: Suppress outbound side effects during restore

**Decision**: the restore path runs with outbox delivery disabled, does not start the worker, and
asserts that no new outbox events were created during the restore. The runbook also requires the
worker to be stopped or isolated.

**Rationale**: restoring historical rows must never send Telegram messages or repeat external
actions. Suppression must be enforced by the drill, not left to operational luck.

**Alternatives considered**:

- Rely on the worker being stopped. Rejected: a supervised worker can restart automatically.
- Delete outbox rows after restore. Rejected: mutates restored evidence and hides the problem.
- Add a global maintenance flag. Rejected: broader change than this feature needs; the outbox
  already has a delivery switch.

## Decision 8: Allowlisted report fields

**Decision**: reports are built from an explicit allowlist: scope name, record counts, financial
totals, currency, checksums, timestamps, operator, target environment, and result. Free-form error
messages are mapped to safe codes before storage.

**Rationale**: regex scrubbing is fragile and can miss new PII shapes. An allowlist makes the
report safe by construction and easy to test.

**Alternatives considered**:

- Redact known PII patterns. Rejected: misses names, addresses, and future fields.
- Store full errors and restrict access. Rejected: violates the PII boundary and increases blast
  radius.
