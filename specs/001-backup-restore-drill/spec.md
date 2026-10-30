# Feature Specification: Backup and Restore Drill

**Feature Branch**: `spec-kit/adoption`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "First Spec Kit feature for MOTO//OPS: close the remaining Phase 6 / R1 operational gate, starting with a backup and restore drill."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Prove recovery before the pilot (Priority: P1)

The owner runs a full recovery drill before the pilot: the system produces a backup, restores it into an isolated environment, and reports whether every in-scope business record and financial total survived. The owner receives a signed evidence record that the pilot can start.

**Why this priority**: R1 cannot be accepted without proof that the rental ledger and documents can be recovered. An untested backup is only a hope, not a recovery plan.

**Independent Test**: Run one drill against a seeded dataset, restore into an empty isolated environment, and confirm that the verification report passes and the evidence record is visible.

**Acceptance Scenarios**:

1. **Given** a populated system and an isolated restore target, **When** the owner starts a drill, **Then** a backup is produced and its manifest records the time, scope, schema version, artifact checksums, record counts, and financial totals.
2. **Given** a completed backup and an empty isolated target, **When** the restore finishes, **Then** the system reports a per-scope comparison of record counts and financial totals against the manifest.
3. **Given** a restore where one record group or financial total does not match, **When** verification runs, **Then** the drill is marked failed, the mismatched scope is named, and no success evidence is issued.
4. **Given** a successful drill, **When** the owner opens the drill history, **Then** the last successful drill, its timestamp, operator, artifact reference, and verification result are visible.

---

### User Story 2 - See whether the system is safe to operate today (Priority: P2)

An operator checks the operational readiness view before opening the counter. The view shows the age of the most recent backup, the result of the last drill, and any unresolved recovery gaps.

**Why this priority**: A backup that silently stopped running is worse than no backup, because the team believes it is protected.

**Independent Test**: With a successful drill recorded and then with a stale or failed drill, confirm that the readiness view changes state and names the gap.

**Acceptance Scenarios**:

1. **Given** a recent successful drill, **When** the operator opens readiness, **Then** recovery is shown as ready with the drill timestamp.
2. **Given** a backup older than the agreed recovery point target or a failed last drill, **When** the operator opens readiness, **Then** recovery is shown as not ready with the specific reason.
3. **Given** no drill has ever run, **When** the operator opens readiness, **Then** recovery is shown as not ready and the first drill is requested.

---

### User Story 3 - Review recovery evidence without exposing PII (Priority: P3)

An auditor or owner reviews the evidence of past drills: who ran them, when, against which scope, what was verified, and what failed. The evidence contains no client names, phone numbers, document numbers, or secrets.

**Why this priority**: Pilot acceptance and later incident review need a trustworthy record, but the record itself must not become a new PII leak.

**Independent Test**: Open a completed drill record and confirm that it contains scope, counts, totals, checksums, operator, and timestamps, but no PII or secret values.

**Acceptance Scenarios**:

1. **Given** a completed drill, **When** an authorized reviewer opens its evidence, **Then** the record is readable and immutable.
2. **Given** a drill report, **When** it is searched for client identifiers, document numbers, phone numbers, email addresses, or secret values, **Then** none are present.

---

### Edge Cases

- The latest backup is older than the agreed recovery point target.
- The restore target is not isolated, or its address matches the production environment.
- A backup artifact is missing, truncated, or its checksum does not match.
- Record counts match but a financial total differs, or the reverse.
- Stored documents are missing even though database records were restored.
- A restore is interrupted and the target is left partially populated.
- The operator lacks the owner/admin role required to run or review a drill.
- The backup was produced by an older data format version than the restore target.
- Restoring triggers outbound notifications or other external side effects.
- A drill report accidentally includes a client name, phone number, document number, or secret.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST produce a consistent backup of all in-scope business records and stored documents.
- **FR-002**: Every backup MUST have a manifest that records its creation time, scope, data format version, artifact checksums, record counts per record group, and financial totals per currency.
- **FR-003**: The system MUST restore a backup into an explicitly designated isolated target and MUST refuse to restore into an environment that is not clearly marked as non-production.
- **FR-004**: After a restore, the system MUST compare record counts and financial totals with the manifest and report a pass or fail for each scope.
- **FR-005**: A drill result MUST be stored as an append-only evidence record containing the operator, time, scope, artifact reference, verification result, and any mismatch details.
- **FR-006**: Authorized operators MUST be able to see the most recent successful drill, the age of the latest backup, and any unresolved recovery gap.
- **FR-007**: A documented runbook MUST define roles, recovery point and recovery time targets, step-by-step execution, failure handling, and the rollback path.
- **FR-008**: Drill reports, logs, and evidence MUST NOT contain client names, phone numbers, email addresses, document numbers, or secret values.
- **FR-009**: A restore MUST suppress outbound notifications and any other external side effect.
- **FR-010**: Running a drill MUST NOT modify production business records.
- **FR-011**: Access to run, view, or export drill evidence MUST be limited to owner and admin roles.

### Key Entities

- **Backup Artifact**: A recoverable copy of in-scope business records and stored documents, with a manifest describing its scope and integrity.
- **Drill Run**: One execution of backup, restore, and verification, with an operator, timestamps, target environment, and outcome.
- **Verification Result**: A per-scope comparison of restored counts and financial totals against the manifest, with pass/fail and mismatch details.
- **Evidence Record**: An immutable record of a drill run that can be reviewed for pilot acceptance and incident analysis.
- **Recovery Runbook**: The documented procedure, roles, targets, and failure handling for recovery.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A complete drill, from backup through verification, finishes in under 60 minutes on the pilot dataset.
- **SC-002**: 100% of in-scope record groups and financial totals match after a successful restore.
- **SC-003**: A drill causes zero writes to production business records.
- **SC-004**: An authorized operator can find the most recent drill evidence in under 2 minutes.
- **SC-005**: A drill report contains zero client identifiers, document numbers, phone numbers, email addresses, or secret values.
- **SC-006**: A new operator can complete the documented restore procedure in an isolated environment without undocumented steps.

## Assumptions

- Production and development each use their existing database and document storage providers; the drill must work against both.
- Pilot data is synthetic or approved for the pilot; real client PII is not required for the drill.
- The recovery point target is 24 hours and the recovery time target is 4 hours unless the owner sets stricter targets.
- Owner and admin roles already exist and are enforced by the current authorization model.
- Offsite replication, automated scheduling, and a standby disaster-recovery site are out of scope for this feature.
- The real legacy snapshot, owner reconciliation, physical printer checks, and device acceptance remain separate Phase 6 tasks.

## Out of Scope

- Automated backup scheduling and retention policy automation.
- Offsite or cross-region replication.
- A hot standby or automatic failover.
- Real client PII, real passport data, or real financial data beyond approved pilot data.
- Physical printer, camera, and device acceptance checks.
