# CLI Contract: Recovery Drill

**Feature**: `001-backup-restore-drill`

All commands run from the repository root, write machine-readable output with `--json`, and never
print client data, document numbers, phone numbers, emails, or secrets.

## Commands

### `npm run recovery:backup -- --target <dir>`

Creates a backup artifact at `<dir>` and prints its manifest summary.

**Required**:

- `<dir>` is an empty or new directory inside the configured recovery root.

**Exit codes**:

| Code | Meaning |
|------|---------|
| `0` | Backup created and manifest verified |
| `2` | Invalid arguments, missing configuration, or unsafe target path |
| `4` | Backup failed (database, storage, or checksum error) |

### `npm run recovery:restore -- --artifact <dir> --target-env isolated`

Restores an artifact into the configured isolated target.

**Required**:

- `--target-env isolated` is mandatory.
- The target database and storage endpoints must differ from the configured production endpoints.
- The outbox worker must be stopped or isolated.

**Exit codes**:

| Code | Meaning |
|------|---------|
| `0` | Restore completed and artifact checksums match |
| `2` | Invalid arguments or missing configuration |
| `3` | Isolation guard refused the target |
| `4` | Restore failed |

### `npm run recovery:drill -- --target <dir> [--json]`

Runs backup, restore into the isolated target, verification, and evidence recording in one
command. This is the command used for the pilot gate.

**Exit codes**:

| Code | Meaning |
|------|---------|
| `0` | Drill passed and evidence was recorded |
| `1` | Verification failed; evidence records the failing scopes |
| `2` | Invalid arguments or missing configuration |
| `3` | Isolation guard refused the target |
| `4` | Backup or restore failed before verification |

### `npm run recovery:verify -- --artifact <dir> [--json]`

Re-runs verification against an existing artifact and the configured isolated target without
creating a new backup or evidence record.

**Exit codes**: `0` passed, `1` verification failed, `2` invalid arguments or configuration.

## JSON Output

```json
{
  "command": "drill",
  "status": "passed",
  "drillId": "9f0c2f3e-6f4a-4a4a-9d3e-2b1c0a7e5d11",
  "artifactRef": "recovery/2026-10-28T09-00-00Z",
  "manifestChecksum": "sha256:...",
  "startedAt": "2026-10-28T09:00:00Z",
  "finishedAt": "2026-10-28T09:42:11Z",
  "scopes": [
    { "scope": "motorcycles", "expectedCount": 10, "actualCount": 10, "status": "passed" },
    { "scope": "financial:VND", "expectedTotalMinor": 12500000, "actualTotalMinor": 12500000, "currency": "VND", "status": "passed" }
  ],
  "failureCode": null
}
```

**Rules**:

- `status` is `passed` or `failed`.
- `failureCode` is an allowlisted code, never a raw exception message.
- The output contains no PII and no secret values.
- A failed drill still prints the full per-scope result so the operator can diagnose it.
