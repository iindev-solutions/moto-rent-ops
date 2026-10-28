# Runbook: Backup and Restore Drill

**Feature**: `001-backup-restore-drill`
**Audience**: owner, admin, auditor
**Last validated**: 2026-10-28

This runbook covers the scheduled recovery drill, how to read its evidence, what to do when a
drill fails, and how a real recovery would be performed. It does not cover legacy data import,
physical document custody, or the paper/printer checks.

## 1. Roles and authorization

| Role | Run a drill (CLI) | View readiness and evidence |
| --- | --- | --- |
| owner | Yes | Yes |
| admin | Yes | Yes |
| operator | No | No |

- The CLI requires OS access to the host and an active owner/admin account. The operator is
  identified by `--operator-email` (defaults to `SEED_ADMIN_EMAIL`).
- `/recovery` and `/api/recovery/*` return `401` without a session and `403` for any role other
  than owner/admin.
- Evidence is append-only. No role can update or delete a drill row; the database rejects it.

## 2. Recovery targets

| Target | Value | Source |
| --- | --- | --- |
| Recovery point objective (RPO) | 24 hours | `RECOVERY_RPO_HOURS`, default `24` |
| Recovery time objective (RTO) | 4 hours | Spec assumption; re-confirm with the owner |
| Pilot drill duration | under 60 minutes | Success criterion SC-001 |

Readiness is `ready` only when the latest drill passed **and** its backup is within the RPO. A
backup older than the RPO is reported as `backup_stale`, even if it restored successfully.

## 3. Prerequisites

1. Node.js >= 22 and dependencies installed (`npm install`).
2. `.env` contains the database, storage, and recovery settings.
3. The outbox worker is stopped. For PGlite, the Nuxt app and every other process using the data
   directory must be stopped as well: PGlite is embedded and allows one process at a time.
4. For a PostgreSQL source, `pg_dump` and `pg_restore` are installed and on `PATH`.
5. The isolated target exists or can be created, and it is **not** the production environment.
6. A timestamped artifact directory inside `RECOVERY_ROOT` is available.

## 4. Configuration

```dotenv
RECOVERY_ROOT=.data/recovery
RECOVERY_SOURCE_ENV=development
RECOVERY_RPO_HOURS=24

# Required for every restore and drill. Any other value is refused.
RECOVERY_TARGET_ENV=isolated
RECOVERY_TARGET_PGLITE_DIR=.data/recovery/target/pglite
RECOVERY_TARGET_STORAGE_ROOT=.data/recovery/target/documents

# Production targets that must never be restored into. Comma-separated.
RECOVERY_PRODUCTION_FINGERPRINT=
RECOVERY_PRODUCTION_DATABASE_URL=
```

For PostgreSQL, set `RECOVERY_TARGET_DATABASE_URL` instead of `RECOVERY_TARGET_PGLITE_DIR`.
For S3-compatible target storage, set `RECOVERY_TARGET_S3_*` instead of
`RECOVERY_TARGET_STORAGE_ROOT`.

The isolation guard fails closed. A restore is refused when the marker is missing, the marker is
not exactly `isolated`, the target equals the source, or the target matches any configured
production fingerprint. Refusal happens before any database or storage write.

## 5. Artifact layout

```text
<recovery-root>/<artifact-ref>/
  manifest.json              canonical JSON + SHA-256 checksum
  database/                  PGlite data directory snapshot
  documents/<sha256-key>     stored documents, one file per storage key
```

A PostgreSQL artifact contains `database.dump` (custom format) instead of `database/`.

The manifest records the creation time, source environment, data format version, database
checksum and size, every document checksum, and the per-scope counts and financial totals. Any
edit to `manifest.json` is rejected because the file must be byte-for-byte canonical.

## 6. Drill procedure

### 6.1 Run the drill

```bash
npm run recovery:drill -- \
  --target .data/recovery/drill-2026-10-28 \
  --operator-email owner@example.com \
  --json
```

The command performs, in order:

1. writes a `running` evidence row;
2. records counts and financial totals from the source database;
3. closes the source connection and snapshots the database and every stored document;
4. writes and hashes `manifest.json`;
5. verifies the artifact checksums;
6. restores into the isolated target;
7. re-hashes every restored document;
8. compares counts and financial totals scope by scope;
9. writes terminal evidence, per-scope rows, and an audit event.

Use a new artifact directory for every run. An existing non-empty directory is refused.

### 6.2 Read the result

- Exit `0`: drill passed; every scope matched.
- Exit `1`: verification failed; the report names the failing scope and `mismatchCode`.
- Exit `2`: configuration or usage error.
- Exit `3`: isolation guard refused the restore; no target was written.
- Exit `4`: backup, restore, checksum, or internal execution failure.

The JSON report contains only scope names, counts, totals, currencies, checksums, timestamps, and
allowlisted failure codes. Raw provider errors are never printed or stored.

### 6.3 Confirm readiness

Open `/recovery` as owner/admin (or call `GET /api/recovery/status`). Confirm:

- `ready: true`, `reason: null`, `openGapCount: 0`;
- the latest drill timestamp and backup age are current;
- the evidence list contains the new drill and its detail shows every scope as `passed`.

### 6.4 Clean up

Remove the isolated database and storage target so the next drill starts clean. Keep the artifact
and the evidence rows: they are the audit record. If the artifact is retained off-host, protect it
as sensitive data even though the manifest itself contains no PII.

## 7. Failure handling

| Failure code | Meaning | Action |
| --- | --- | --- |
| `isolation_refused` | Marker missing/wrong, or target is source/production | Fix `RECOVERY_TARGET_ENV` and fingerprints; rerun. No target was written. |
| `target_not_empty` | Isolated target already has data | Use a fresh target directory/database. |
| `artifact_exists` | Artifact directory is not empty | Choose a new timestamped artifact directory. |
| `artifact_invalid` | Manifest, database artifact, or document is missing | Do not restore. Rerun the backup. |
| `checksum_mismatch` | Artifact was truncated, edited, or corrupted | Discard the artifact and produce a new backup. |
| `document_mismatch` | A stored document is missing or changed | Check source object storage, then rerun. |
| `backup_failed` | Database backup provider failed | Check `pg_dump`/disk/logs locally; rerun. Never paste raw logs containing PII into tickets. |
| `restore_failed` | Database restore provider failed | Inspect the isolated target and provider logs; discard the target and rerun. |
| `scope_mismatch` | Restore completed but a count or total differs | Do not use the target. Investigate the named scope, then rerun the whole drill. |
| `operator_not_found` / `operator_not_authorized` | Operator is missing, inactive, or not owner/admin | Correct the account or pass the right `--operator-email`. |
| `configuration_error` | Engine mismatch or missing required setting | Compare the artifact kind with the target provider configuration. |
| `internal_error` | Unexpected failure | Check server logs; do not treat the drill as passed. |

A failed drill still writes terminal `failed` evidence. A crashed process can leave a `running`
row; it is excluded from the evidence list and readiness treats it as `verification_incomplete`.
Run a new drill; the newer terminal row becomes the latest result. Never try to edit the stuck
row.

## 8. Rollback path

The drill never writes to production business records. It reads the source, writes only its own
evidence rows, and restores into an isolated target.

- **Failed or refused drill**: discard the artifact and the isolated target if needed; production
  is unchanged. Fix the cause and rerun.
- **Bad isolated restore**: delete the isolated target and rerun. No production rollback is
  required.
- **Real recovery after an incident**: this is a separate, owner-approved operation.
  1. Declare the incident, freeze writes, and stop the outbox worker.
  2. Select the latest artifact whose drill passed.
  3. Provision a new isolated target and run `recovery:restore` + `recovery:verify`.
  4. Only after verification passes, switch the application to the restored database and storage
     (or copy them back during the maintenance window).
  5. Keep the failed production data and all evidence for the post-incident review.

Do not point `RECOVERY_TARGET_*` at production to "save time". The guard is designed to refuse it.

## 9. Evidence retention

- `recovery_drills` and `recovery_drill_scopes` are append-only. Database triggers reject updates
  and deletes.
- Keep evidence for the life of the pilot and at least 12 months after it, or longer if the owner
  or legal requires. Changing the retention period requires a reviewed migration, not manual
  deletion.
- Evidence contains no client names, phone numbers, emails, document numbers, or secrets. It does
  contain the operator display name, artifact reference, checksums, timestamps, counts, totals,
  and result codes.
- Artifacts are separate from evidence. They contain business data and must be stored with the
  same care as the source database.

## 10. Drill log

| Date | Environment | Result | Evidence |
| --- | --- | --- | --- |
| 2026-10-28 | Scratch seeded PGlite (temp dir) | Passed: 27 record groups, `financial:VND` 18,370,000 on both sides; exit `0` | CLI probe, artifact under temp recovery root |
| 2026-10-28 | Restore without `RECOVERY_TARGET_ENV` | Refused: `isolation_refused`, exit `3`, no target written | CLI probe |
| 2026-10-28 | Target matching `RECOVERY_PRODUCTION_FINGERPRINT` | Refused: `isolation_refused`, exit `3`, target not created | CLI probe |
| 2026-10-28 | Isolated restore + verify of the passed artifact | Passed: restore exit `0`, verify exit `0` | CLI probe |
| 2026-10-28 | API access control and evidence (`recovery-drill.spec.ts`) | Passed: `401`, `403`, list/cursor/detail/`404` | E2E test run |
| 2026-10-28 | Failed verification and failed evidence (`recovery-verify.test.ts`, `recovery-evidence.test.ts`, `recovery-status.test.ts`) | Passed: `count_mismatch`/`total_mismatch` named, failed drill stored, readiness reports `last_drill_failed` | Unit/integration tests |
| 2026-10-28 | PII boundary of API responses | Passed: no emails, phones, passport numbers, or names in list/detail payloads | E2E assertions and `recovery-pii.test.ts` |
| 2026-10-28 | Outbound side effects | Passed: outbox event count unchanged after a full drill | `recovery-drill.test.ts` |
| 2026-10-28 | Read-only verify of an already restored target | Passed: `verifyRecoveryBackup` matched checksum and every scope, wrote no evidence, refused a missing target without creating it | `recovery-drill.test.ts` |
| 2026-10-28 | Full gates on branch `spec-kit/adoption` | Passed: `npm run typecheck` 0 errors; `npm test` 95/95 in 9 files; `npm run build` complete (24.9 MB) | Local gate run |

A skipped check is a gap, not a pass.
