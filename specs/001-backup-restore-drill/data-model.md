# Data Model: Backup and Restore Drill

**Feature**: `001-backup-restore-drill` | **Date**: 2026-10-28

## Recovery Drill

One execution of backup, restore, and verification.

| Field | Type | Rules |
|-------|------|-------|
| `id` | UUID | Primary key, generated at start |
| `operatorUserId` | UUID | Required; references the user who ran the drill |
| `startedAt` | timestamp | Required; set when the backup starts |
| `finishedAt` | timestamp | Required when the drill reaches a terminal state |
| `targetEnvironment` | text | Required; must equal `isolated` for a restore |
| `artifactRef` | text | Required; path or object key inside the configured recovery root |
| `manifestChecksum` | text | Required; SHA-256 of the manifest |
| `status` | enum | `running`, `passed`, `failed` |
| `failureCode` | text | Required when `status = failed`; allowlisted code, never a raw error message |
| `createdAt` | timestamp | Required; immutable |

**State transitions**: `running → passed` or `running → failed`. A terminal row is immutable:
updates to `status`, `finishedAt`, `failureCode`, `artifactRef`, or `manifestChecksum` are rejected
after the terminal transition, and deletion is rejected for every row.

**Relationships**:

- One drill has many scope results.
- One drill references one operator user.
- One drill produces one audit event.
- One drill references one backup artifact through `artifactRef`.

## Recovery Drill Scope

Per-scope verification result for one drill.

| Field | Type | Rules |
|-------|------|-------|
| `id` | UUID | Primary key |
| `drillId` | UUID | Required; references `recovery_drills.id` with cascade delete disabled |
| `scope` | text | Required; stable name such as a record group or `financial:VND` |
| `expectedCount` | integer | Required; `>= 0` |
| `actualCount` | integer | Required; `>= 0` |
| `expectedTotalMinor` | bigint | Nullable; required for financial scopes |
| `actualTotalMinor` | bigint | Nullable; required for financial scopes |
| `currency` | char(3) | Nullable; ISO 4217, required when a total is present |
| `status` | enum | `passed`, `failed` |
| `mismatchCode` | text | Required when `status = failed`; allowlisted code |

**Rules**:

- `(drillId, scope)` is unique.
- A row is immutable after insert.
- A financial scope has both totals and a currency; a non-financial scope has neither.
- A failed scope requires a mismatch code; a passed scope has none.

## Backup Manifest

A signed description of one backup artifact. Stored inside the artifact, not in the database.

| Field | Type | Rules |
|-------|------|-------|
| `manifestVersion` | integer | Required; starts at `1` |
| `createdAt` | timestamp | Required; backup start time in UTC |
| `sourceEnvironment` | text | Required; `development`, `staging`, or `production` |
| `dataFormatVersion` | text | Required; the migration or data format version at backup time |
| `databaseChecksum` | text | Required; SHA-256 of the database archive |
| `databaseBytes` | bigint | Required; `>= 0` |
| `documents` | array | Required; each entry has `path`, `checksum`, and `bytes` |
| `scopes` | array | Required; each entry has `name`, `count`, `totalMinor`, and `currency` |
| `toolVersion` | text | Required; version of the drill tool that produced the manifest |

**Rules**:

- Paths are relative and must not escape the artifact root.
- Every document entry has a SHA-256 checksum and a non-negative size.
- Financial scopes carry integer minor units and an ISO 4217 currency.
- The manifest contains no client names, phone numbers, emails, document numbers, or secrets.

## Recovery Status

A read-only projection for the owner/admin readiness view.

| Field | Type | Rules |
|-------|------|-------|
| `ready` | boolean | `true` only when the last drill passed and the latest backup is within the recovery point target |
| `reason` | text | Allowlisted reason code when `ready = false` |
| `lastDrillId` | UUID | Nullable; most recent terminal drill |
| `lastDrillAt` | timestamp | Nullable; completion time of the most recent terminal drill |
| `lastBackupAt` | timestamp | Nullable; creation time of the latest backup |
| `backupAgeSeconds` | integer | Nullable; `>= 0` |
| `openGapCount` | integer | `>= 0`; number of failed or stale checks |

**Rules**:

- `ready = true` requires a passed drill, a backup age within the target, and zero open gaps.
- The projection never exposes PII, artifact contents, or secrets.

## Recovery Runbook

A versioned operational document, not a database entity.

**Required sections**: purpose and scope, roles, recovery point target, recovery time target,
prerequisites, backup procedure, restore procedure, verification procedure, failure handling,
rollback, evidence retention, and a drill log template.

**Rules**:

- Every command in the runbook is copy-pasteable and uses the same CLI as the drill.
- The runbook names the owner and the backup operator roles.
- The runbook states that a drill is invalid if verification did not pass.

## Entity Relationship Summary

```text
User 1 ─── N RecoveryDrill 1 ─── N RecoveryDrillScope
                  │
                  ├── 1 AuditEvent (drill completion)
                  └── 1 BackupArtifact (by artifactRef)

RecoveryStatus is a read-only projection over RecoveryDrill, RecoveryDrillScope,
and the latest BackupManifest metadata.
```
