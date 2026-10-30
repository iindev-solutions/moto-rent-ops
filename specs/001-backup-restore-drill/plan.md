# Implementation Plan: Backup and Restore Drill

**Branch**: `spec-kit/adoption` | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-backup-restore-drill/spec.md`

## Summary

Deliver a repeatable recovery drill for the R1 pilot: produce a consistent backup of the
database and stored documents, restore it into an explicitly isolated target, verify record
counts and financial totals against a signed manifest, and expose the result as append-only
evidence plus an owner/admin readiness view. The drill runs from a CLI, writes evidence through
the existing audit model, and never touches production business records.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node.js >= 22

**Primary Dependencies**: Nuxt 4.5, Drizzle ORM, PGlite (dev/test) and PostgreSQL (production),
existing S3-compatible storage adapter, existing auth, audit, and outbox modules

**Storage**: PostgreSQL in production, PGlite in development; S3-compatible document storage in
production, local filesystem in development

**Testing**: Vitest 5 unit/integration tests and Nuxt test-utils end-to-end tests

**Target Platform**: Linux server for production; Windows/macOS developer machines; no PWA client
changes are required for the drill itself

**Project Type**: web application monorepo (`apps/web`, `packages/db`, `packages/domain`,
`packages/storage`, `packages/contracts`)

**Performance Goals**: a complete drill finishes in under 60 minutes on the pilot dataset; the
readiness view responds in under 2 seconds; manifest generation stays under 5 minutes for the
pilot data volume

**Constraints**: no PII or secrets in reports; zero writes to production business records;
restore target must be explicitly isolated; owner/admin access only; no network call inside a
database transaction; completed evidence is immutable

**Scale/Scope**: one rental branch, 10–50 motorcycles, fewer than 20 staff, fewer than 1,000
active agreements, and under 10 GB of stored documents for the pilot

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Verified Change | Plan requires `npm run typecheck`, `npm test`, `npm run build`, plus a real drill on seeded data before any success claim. | PASS |
| II. Financial and Audit Truth | Verification compares immutable financial totals, evidence is append-only, and the drill writes an audit event without a network call inside a transaction. | PASS |
| III. PII and QR Boundary | Reports contain counts, totals, checksums, and timestamps only; no client identifiers, document numbers, phone numbers, emails, or secrets. Access is owner/admin only. | PASS |
| IV. Portable Domain Core | Backup/restore providers live in `packages/db` and `packages/storage`; orchestration lives in server utilities and a CLI; no Nuxt component contains business logic. | PASS |
| V. Offline Honesty and Operational Readiness | Readiness is explicit (`ready` / `not ready` with a reason), the runbook defines RTO/RPO and failure handling, and the drill does not imply success when verification fails. | PASS |

No violations; Complexity Tracking stays empty.

**Post-design re-check (Phase 1)**: PASS. The design keeps recovery providers outside Nuxt,
stores only allowlisted evidence fields, verifies financial totals, and requires an isolated
target. No new constitution violation was introduced by the data model or contracts.

## Project Structure

### Documentation (this feature)

```text
specs/001-backup-restore-drill/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Phase 1 entities and invariants
├── quickstart.md        # Phase 1 validation guide
├── contracts/           # CLI and read-only API contracts
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
apps/web/
├── app/
│   ├── pages/recovery.vue                 # owner/admin readiness and evidence view
│   └── components/RecoveryDrillList.vue   # optional list/detail component
├── server/
│   ├── api/recovery/status.get.ts         # readiness snapshot
│   ├── api/recovery/drills/index.get.ts   # evidence list
│   ├── api/recovery/drills/[id].get.ts    # evidence detail with scopes
│   └── utils/recovery-drill.ts            # orchestration and evidence writes
├── scripts/recovery-drill.ts              # CLI: backup, restore, drill, verify
└── tests/
    ├── recovery-drill.test.ts             # manifest, verification, isolation guard
    └── e2e/recovery-drill.spec.ts         # PGlite drill and authorization

packages/db/
├── migrations/0020_recovery_drills.sql    # evidence tables
└── src/recovery/
    ├── index.ts                           # provider selection
    ├── types.ts                           # manifest and verification types
    ├── manifest.ts                        # checksums and scope totals
    ├── pglite.ts                          # PGlite data-directory backup/restore
    ├── postgres.ts                        # pg_dump/pg_restore adapter
    └── verify.ts                          # count and financial-total comparison

packages/storage/src/recovery.ts           # document copy and checksum adapter

docs/runbooks/backup-restore.md            # roles, RTO/RPO, steps, failure handling
```

**Structure Decision**: the monorepo already separates domain, database, storage, contracts, and
the Nuxt app. Recovery providers belong in `packages/db` and `packages/storage` so they can be
tested without Nuxt; the CLI and read-only API are thin orchestration surfaces in `apps/web`.
This preserves the existing boundaries and avoids a new package for a single workflow.

## Complexity Tracking

> No constitution violations. No additional complexity requires justification.
