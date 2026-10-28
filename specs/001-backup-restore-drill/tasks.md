# Tasks: Backup and Restore Drill

**Input**: Design documents from `/specs/001-backup-restore-drill/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required by the project constitution (Verified Change). Test tasks are included and MUST
be written first; they must fail before the corresponding implementation.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every task

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the module skeletons, scripts, configuration keys, and runbook placeholder.

- [ ] T001 Create recovery module directories and shared types in `packages/db/src/recovery/types.ts`
- [ ] T002 [P] Create storage recovery adapter skeleton in `packages/storage/src/recovery.ts`
- [ ] T003 [P] Add `recovery:backup`, `recovery:restore`, `recovery:drill`, and `recovery:verify` scripts to `package.json`
- [ ] T004 [P] Document `RECOVERY_ROOT`, `RECOVERY_TARGET_ENV`, and `RECOVERY_RPO_HOURS` in `.env.example`
- [ ] T005 [P] Create the runbook skeleton in `docs/runbooks/backup-restore.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Evidence schema, manifest, providers, verification engine, orchestration, and CLI
plumbing. No user story work can begin until this phase is complete.

- [ ] T006 Create migration `packages/db/migrations/0020_recovery_drills.sql` with `recovery_drills` and `recovery_drill_scopes`, including the `(drillId, scope)` unique constraint, status enums, and terminal-row immutability guards
- [ ] T007 [P] Add Drizzle definitions for both recovery tables in `packages/db/src/schema.ts`
- [ ] T008 [P] Implement manifest creation, SHA-256 checksums, and manifest validation in `packages/db/src/recovery/manifest.ts`
- [ ] T009 [P] Implement the allowlisted report/error mapping in `apps/web/server/utils/recovery-report.ts`
- [ ] T010 Implement the `RecoveryProvider` interface and environment-based selection in `packages/db/src/recovery/index.ts`
- [ ] T011 Implement the PGlite provider (data-directory snapshot and restore) in `packages/db/src/recovery/pglite.ts`
- [ ] T012 Implement the PostgreSQL provider (`pg_dump` custom archive and `pg_restore`) in `packages/db/src/recovery/postgres.ts`
- [ ] T013 Implement document copy, checksum, and source-listing checks in `packages/storage/src/recovery.ts`
- [ ] T014 Implement count and financial-total verification in `packages/db/src/recovery/verify.ts`
- [ ] T015 Implement drill orchestration and evidence writes in `apps/web/server/utils/recovery-drill.ts`
- [ ] T016 Implement the CLI argument parser, exit codes, and JSON output in `apps/web/scripts/recovery-drill.ts`
- [ ] T017 Implement the readiness projection query in `apps/web/server/utils/recovery-status.ts`
- [ ] T018 [P] Reuse the existing owner/admin authorization helper for recovery endpoints in `apps/web/server/utils/recovery-auth.ts`

**Checkpoint**: foundation ready; user stories can begin.

---

## Phase 3: User Story 1 - Prove recovery before the pilot (Priority: P1) MVP

**Goal**: run a backup, restore it into an isolated target, verify counts and financial totals, and
record append-only evidence.

**Independent Test**: seed a development dataset, run `npm run recovery:drill -- --target <dir>`,
and confirm exit code `0`, a passed JSON result, and a visible evidence row.

### Tests for User Story 1

> Write these tests first and confirm they fail before implementation.

- [ ] T019 [P] [US1] Unit test manifest checksums and path-escape rejection in `apps/web/tests/recovery-manifest.test.ts`
- [ ] T020 [P] [US1] Unit test count and financial-total mismatch reporting in `apps/web/tests/recovery-verify.test.ts`
- [ ] T021 [P] [US1] Integration test the PGlite backup/restore/drill flow in `apps/web/tests/recovery-drill.test.ts`
- [ ] T022 [P] [US1] Test the isolation guard refuses a missing marker and a production-matching target in `apps/web/tests/recovery-isolation.test.ts`
- [ ] T023 [P] [US1] Test terminal evidence immutability and failed-drill evidence in `apps/web/tests/recovery-evidence.test.ts`

### Implementation for User Story 1

- [ ] T024 [US1] Implement `recovery:backup` in `apps/web/scripts/recovery-drill.ts`
- [ ] T025 [US1] Implement `recovery:restore` with the isolation guard in `apps/web/scripts/recovery-drill.ts`
- [ ] T026 [US1] Implement `recovery:drill` orchestration and exit codes in `apps/web/scripts/recovery-drill.ts`
- [ ] T027 [US1] Persist terminal drill and per-scope evidence in `apps/web/server/utils/recovery-drill.ts`
- [ ] T028 [US1] Write the drill completion audit event through the existing audit module in `apps/web/server/utils/recovery-drill.ts`
- [ ] T029 [US1] Emit the contract-compliant JSON result and allowlisted failure codes in `apps/web/scripts/recovery-drill.ts`

**Checkpoint**: User Story 1 is fully functional and testable from the CLI.

---

## Phase 4: User Story 2 - See whether the system is safe to operate today (Priority: P2)

**Goal**: an owner/admin sees whether recovery is ready, the last drill result, backup age, and the
specific reason when not ready.

**Independent Test**: with a passed drill the status is ready; with a stale or failed drill the
status is not ready and names the reason.

### Tests for User Story 2

- [ ] T030 [P] [US2] Unit test readiness reasons (`no_drill`, `last_drill_failed`, `backup_stale`, `verification_incomplete`) in `apps/web/tests/recovery-status.test.ts`
- [ ] T031 [P] [US2] E2E test owner/admin access and `401`/`403` behavior for the status endpoint in `apps/web/tests/e2e/recovery-drill.spec.ts`

### Implementation for User Story 2

- [ ] T032 [US2] Implement the readiness projection in `apps/web/server/utils/recovery-status.ts`
- [ ] T033 [US2] Implement `GET /api/recovery/status` with `cache-control: no-store` in `apps/web/server/api/recovery/status.get.ts`
- [ ] T034 [US2] Build the `/recovery` page with readiness state and reason in `apps/web/app/pages/recovery.vue`
- [ ] T035 [US2] Add the owner/admin-only navigation entry in `apps/web/app/layouts/default.vue`
- [ ] T036 [US2] Add `recovery.*` strings to `apps/web/app/locales/en.json` and `apps/web/app/locales/vi.json`

**Checkpoint**: readiness is visible without shell access.

---

## Phase 5: User Story 3 - Review recovery evidence without exposing PII (Priority: P3)

**Goal**: an owner or auditor reviews immutable drill evidence and per-scope results with no PII.

**Independent Test**: open a completed drill and confirm scope, counts, totals, checksums, operator,
and timestamps are present; confirm client identifiers, document numbers, phone numbers, emails, and
secrets are absent.

### Tests for User Story 3

- [ ] T037 [P] [US3] E2E test drill list/detail access control and `404` for unknown IDs in `apps/web/tests/e2e/recovery-drill.spec.ts`
- [ ] T038 [P] [US3] Test the evidence payload contains only allowlisted fields in `apps/web/tests/recovery-pii.test.ts`

### Implementation for User Story 3

- [ ] T039 [US3] Implement `GET /api/recovery/drills` with limit and cursor in `apps/web/server/api/recovery/drills/index.get.ts`
- [ ] T040 [US3] Implement `GET /api/recovery/drills/[id]` with scopes in `apps/web/server/api/recovery/drills/[id].get.ts`
- [ ] T041 [US3] Render the evidence list and detail on `/recovery` in `apps/web/app/pages/recovery.vue`
- [ ] T042 [US3] Add the evidence list/detail strings to `apps/web/app/locales/en.json` and `apps/web/app/locales/vi.json`

**Checkpoint**: evidence is reviewable and PII-safe.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: operational documentation and final verification.

- [ ] T043 [P] Complete `docs/runbooks/backup-restore.md` with roles, RTO/RPO, failure handling, rollback, and evidence retention
- [ ] T044 [P] Validate every `quickstart.md` scenario and record the results in the runbook drill log
- [ ] T045 Run `npm run typecheck`, `npm test`, and `npm run build`; record the evidence
- [ ] T046 [P] Update `ROADMAP.md` and `memory/2026-10-28.md` with the drill status and remaining Phase 6 gaps
- [ ] T047 Review the final diff for PII, secrets, and unrelated changes, then commit the feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup; blocks all user stories.
- **User Story 1 (Phase 3)**: depends on Foundational.
- **User Story 2 (Phase 4)**: depends on Foundational; consumes US1 evidence but is testable with fixtures.
- **User Story 3 (Phase 5)**: depends on Foundational and US1 evidence; can use fixtures.
- **Polish (Phase 6)**: depends on all desired user stories.

### User Story Dependencies

- **US1 (P1)**: no dependency on other stories.
- **US2 (P2)**: may integrate with US1 but can be tested with seeded evidence fixtures.
- **US3 (P3)**: may integrate with US1 but can be tested with seeded evidence fixtures.

### Within Each User Story

- Tests first and failing before implementation.
- Manifest and providers before orchestration.
- Orchestration before CLI and API surfaces.
- CLI/API before UI.
- Story complete before moving to the next priority.

### Parallel Opportunities

- T002–T005 can run in parallel after T001.
- T007–T009 and T018 can run in parallel once T006 is defined.
- T019–T023 can run in parallel.
- T030–T031 can run in parallel.
- T037–T038 can run in parallel.
- T043 and T046 can run in parallel with final validation.

---

## Parallel Example: User Story 1

```bash
# Launch the independent test tasks together:
Task: "Unit test manifest checksums and path-escape rejection in apps/web/tests/recovery-manifest.test.ts"
Task: "Unit test count and financial-total mismatch reporting in apps/web/tests/recovery-verify.test.ts"
Task: "Integration test the PGlite backup/restore/drill flow in apps/web/tests/recovery-drill.test.ts"
Task: "Test the isolation guard in apps/web/tests/recovery-isolation.test.ts"
Task: "Test terminal evidence immutability in apps/web/tests/recovery-evidence.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: run the drill on a seeded dataset and inspect the evidence row.
5. Demo the CLI result before adding the readiness page.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → CLI drill + evidence (MVP).
3. US2 → readiness page.
4. US3 → evidence review page.
5. Polish → runbook, gates, roadmap, commit.

### Notes

- [P] tasks touch different files and have no incomplete dependencies.
- Each story is independently completable and testable.
- Verify tests fail before implementing.
- Commit after each logical group.
- Do not start the UI before the CLI drill passes on seeded data.
