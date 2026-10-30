# API Contract: Recovery Readiness and Evidence

**Feature**: `001-backup-restore-drill`

All endpoints require an authenticated owner or admin session. Responses use
`cache-control: no-store`. A non-authorized session receives `403`; an unauthenticated request
receives `401`.

## `GET /api/recovery/status`

Returns the readiness projection.

```json
{
  "ready": true,
  "reason": null,
  "lastDrillId": "9f0c2f3e-6f4a-4a4a-9d3e-2b1c0a7e5d11",
  "lastDrillAt": "2026-10-28T09:42:11Z",
  "lastBackupAt": "2026-10-28T09:00:00Z",
  "backupAgeSeconds": 2531,
  "openGapCount": 0
}
```

**Rules**:

- `ready` is `true` only for a passed drill, a backup within the recovery point target, and zero
  open gaps.
- `reason` is an allowlisted code such as `no_drill`, `last_drill_failed`, `backup_stale`, or
  `verification_incomplete`.
- The response contains no PII, artifact contents, or secrets.

## `GET /api/recovery/drills?limit=20&cursor=<id>`

Returns terminal drills, newest first.

```json
{
  "drills": [
    {
      "id": "9f0c2f3e-6f4a-4a4a-9d3e-2b1c0a7e5d11",
      "status": "passed",
      "startedAt": "2026-10-28T09:00:00Z",
      "finishedAt": "2026-10-28T09:42:11Z",
      "operatorName": "Owner",
      "targetEnvironment": "isolated",
      "artifactRef": "recovery/2026-10-28T09-00-00Z",
      "failureCode": null
    }
  ],
  "nextCursor": null
}
```

**Rules**:

- `limit` defaults to `20` and is capped at `100`.
- `operatorName` is the display name only; no email or phone number.
- `artifactRef` is a relative reference, never an absolute filesystem path or credential.

## `GET /api/recovery/drills/{id}`

Returns one drill with its per-scope verification rows.

```json
{
  "id": "9f0c2f3e-6f4a-4a4a-9d3e-2b1c0a7e5d11",
  "status": "failed",
  "startedAt": "2026-10-28T09:00:00Z",
  "finishedAt": "2026-10-28T09:42:11Z",
  "operatorName": "Owner",
  "targetEnvironment": "isolated",
  "artifactRef": "recovery/2026-10-28T09-00-00Z",
  "manifestChecksum": "sha256:...",
  "failureCode": "scope_mismatch",
  "scopes": [
    { "scope": "motorcycles", "expectedCount": 10, "actualCount": 9, "status": "failed", "mismatchCode": "count_mismatch" },
    { "scope": "financial:VND", "expectedTotalMinor": 12500000, "actualTotalMinor": 12500000, "currency": "VND", "status": "passed" }
  ]
}
```

**Rules**:

- Unknown IDs return `404`.
- Terminal evidence is immutable; no endpoint updates or deletes a drill.
- The response contains no PII, raw errors, artifact contents, or secrets.
