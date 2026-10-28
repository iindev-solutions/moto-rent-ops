# Quickstart: Backup and Restore Drill

**Feature**: `001-backup-restore-drill`

This guide validates the feature end-to-end after implementation. It does not contain
implementation code or migrations.

## Prerequisites

1. Node.js >= 22 and dependencies installed (`npm install`).
2. `.env` configured with the development database and storage settings.
3. A seeded development dataset (`npm run db:seed`).
4. The outbox worker stopped.
5. A target directory for the artifact that is inside the configured recovery root.

## 1. Unit and contract checks

```bash
npm run typecheck
npm test -- recovery-drill
```

**Expected**: zero type errors; manifest, verification, isolation-guard, and PII-allowlist tests
pass.

## 2. Run a full drill

```bash
npm run recovery:drill -- --target .data/recovery/drill-2026-10-28 --json
```

**Expected**:

- Exit code `0`.
- JSON output has `"status": "passed"`.
- Every scope has `expectedCount === actualCount`.
- Every financial scope has `expectedTotalMinor === actualTotalMinor`.
- A new drill ID appears in the evidence list.

## 3. Check readiness

Open `/recovery` as an owner or admin, or call:

```bash
curl -s -b cookies.txt http://localhost:3000/api/recovery/status
```

**Expected**:

```json
{
  "ready": true,
  "reason": null,
  "openGapCount": 0
}
```

The page shows the drill timestamp, operator, artifact reference, and per-scope result.

## 4. Prove the isolation guard

Run a restore without the isolated marker:

```bash
npm run recovery:restore -- --artifact .data/recovery/drill-2026-10-28
```

**Expected**: exit code `3`; the command refuses to run and no data is written.

## 5. Prove a failed drill is visible

Use a test fixture with one deliberately missing record or a tampered financial total, then run the
drill against it.

**Expected**:

- Exit code `1`.
- The failing scope is named with `count_mismatch` or `total_mismatch`.
- `/recovery` shows `ready: false` and the failure reason.
- No success evidence is issued.

## 6. Check the PII boundary

Search the drill JSON output and the evidence API response for client names, phone numbers, email
addresses, document numbers, and secret values.

**Expected**: zero matches. Only scope names, counts, totals, currencies, checksums, timestamps,
operator display name, target environment, and result codes are present.

## 7. Confirm no production side effects

1. Confirm the outbox has no new events created by the restore.
2. Confirm the production database and storage endpoints received zero writes.
3. Confirm no Telegram message was sent.

**Expected**: all three checks show zero activity.

## 8. Run the standard gates

```bash
npm run typecheck
npm test
npm run build
```

**Expected**: all three pass. Record the results in the drill evidence or the pilot checklist.

## Cleanup

Remove the test artifact directory and any temporary isolated database or storage target created
for the drill. Do not remove evidence rows; they are the audit record.
