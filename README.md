# MOTO//OPS

Production-first motorcycle rental operations PWA.

## Stack

- Nuxt 4 + Vue 3 + Nitro
- Nuxt UI + Tailwind CSS
- PostgreSQL + Drizzle ORM (PGlite in development, managed PostgreSQL in production)
- S3-compatible storage (local filesystem adapter in development, VNPT/S3 in production)
- PostgreSQL-backed worker/outbox
- `zxing-wasm` scanner fallback with native `BarcodeDetector` enhancement

## Local development

1. Copy `.env.example` to `.env` and set a 32-byte base64 `TOKEN_ENCRYPTION_KEY` and a 32+ character `NUXT_SESSION_PASSWORD`.
2. Install dependencies: `npm install`.
3. Apply the same SQL migrations to PGlite: `npm run db:generate && npm run db:migrate`.
4. Seed local users and fleet records: `npm run db:seed`.
   The seed command prints local `/b/{token}` deep links for immediate manual testing.
5. Start Nuxt: `npm run dev`.

PGlite persists to `packages/db/.data/pglite` by default; the local filesystem storage adapter uses `.data/documents`. Docker is optional and is not required for the default development path. Production uses managed PostgreSQL and VNPT/S3 through the same interfaces.

## Outbox worker

Telegram delivery is a separate process. It claims `outbox_events` rows, sends plain-text messages, journals every attempt, retries with backoff, dead-letters exhausted events, and supports owner/admin replay from `/notifications`.

```bash
npm run outbox:worker
```

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to enable delivery. Without them the worker leaves events pending and logs a warning. Financial messages are internal records, not payment confirmations, and Telegram never changes a financial result.

## Legacy import

The importer uses a staging batch plus per-source-row payload/hash provenance. It validates the whole snapshot before applying anything, reports duplicates and conflicts, and is idempotent through deterministic target IDs.

1. Export one JSON snapshot of the R1 perimeter: `clients`, `motorcycles`, `agreements`, `rentalItems`, `obligations`, `receipts`, `deposits`, `documentCustodies`.
2. Run a dry run. This writes only `legacy_import_batches` / `legacy_import_rows` and the audit event:

```bash
npx tsx apps/web/scripts/import-legacy.ts --file snapshot.json --label "R1 dry run"
```

3. Review `report.issues`, `report.tables`, and `report.sourceTotals` vs `report.importableTotals`. Fix or map rejected rows before applying.
4. Apply the same file. Invalid rows abort the whole apply; existing deterministic target IDs are reported as duplicates and never overwritten:

```bash
npx tsx apps/web/scripts/import-legacy.ts --file snapshot.json --apply --label "R1 apply"
```

The same operation is available to owners/admins as `POST /api/imports/legacy` with `{ snapshot, apply, label }`, and batch history is available at `GET /api/imports/legacy`.

Each top-level row needs a stable `sourceId`. References use source IDs, for example an agreement has `clientSourceId`, and a receipt allocation has `obligationSourceId`. Imported motorcycles receive fresh QR credentials automatically. See `apps/web/server/utils/legacy-import.ts` for the exact accepted fields and validation rules.

Financial rows must carry explicit `status`, `type`/`method` and timestamps; the importer does not silently default them to the current time or a guessed state. A closed cash deposit must include its `dispositions` history.

```json
{
  "clients": [{ "sourceId": "c-1", "displayName": "Nguyen Van A", "contacts": [{ "channel": "phone", "value": "+84900000000", "isPrimary": true }] }],
  "motorcycles": [{ "sourceId": "b-1", "assetCode": "BM-101", "model": "Honda Wave", "status": "rented", "location": "District 1" }],
  "agreements": [{ "sourceId": "a-1", "clientSourceId": "c-1", "status": "active", "startDate": "2026-10-01T00:00:00+07:00" }],
  "rentalItems": [{ "sourceId": "i-1", "agreementSourceId": "a-1", "motorcycleSourceId": "b-1", "startDate": "2026-10-01T00:00:00+07:00", "endDate": "2026-11-01T00:00:00+07:00", "dailyRateMinor": 200000, "status": "active" }],
  "obligations": [{ "sourceId": "o-1", "clientSourceId": "c-1", "agreementSourceId": "a-1", "type": "rent", "amountMinor": 1000000, "dueDate": "2026-10-15T00:00:00+07:00" }],
  "receipts": [{ "sourceId": "r-1", "clientSourceId": "c-1", "amountMinor": 400000, "method": "cash", "receivedAt": "2026-10-05T00:00:00+07:00", "allocations": [{ "obligationSourceId": "o-1", "amountMinor": 400000 }] }],
  "deposits": [{ "sourceId": "d-1", "clientSourceId": "c-1", "agreementSourceId": "a-1", "type": "cash", "status": "held", "amountMinor": 2000000, "receivedAt": "2026-10-01T00:00:00+07:00" }],
  "documentCustodies": [{ "sourceId": "doc-1", "clientSourceId": "c-1", "documentType": "passport", "maskedNumber": "C01X00***", "status": "held", "receivedAt": "2026-10-01T00:00:00+07:00" }]
}
```

## Product invariants

- QR identifies a physical motorcycle, not a rental or client.
- QR contains no PII and is not an authorization credential.
- Authenticated app routes are `ssr: false` and API responses use `no-store`.
- Business rules and SQL do not depend on Nuxt components or route handlers.
- Financial state is derived from immutable facts; there is no `paid` boolean.
- Worker/outbox is a separate process.
- Passport scans are not stored. A physical document is represented by custody events and masked metadata only; cash deposits use the 2M/5M VND options.
- Reads that disclose masked document requisites (documents list, client card) or custody metadata (settlement) write an `audit_events` row before the response is returned; the log is readable by owners and admins via `GET /api/audit`.

See `ROADMAP.md` for the phased delivery plan.

## Known limitations

- PGlite is a single-process development database. Production must set `DATABASE_PROVIDER=postgres` / `DATABASE_URL` and run the same SQL migrations against managed PostgreSQL.
- The default file storage adapter is local-only. Production must configure the S3-compatible adapter and verify backup/restore.
- The outbox worker must run as a separate supervised process. If it is stopped, events remain pending; they are not lost.
- Login throttling is durable in `rate_limit_buckets` (SHA-256 email+IP keys, 10 attempts / 10 minutes), so it survives restarts and works across app instances that share PostgreSQL. Set `NUXT_TRUST_PROXY=true` only behind a reverse proxy that overwrites `X-Forwarded-For`; otherwise the socket IP is used.
- Legacy import is implemented and tested with synthetic snapshots. A real legacy snapshot, reconciliation totals, and sign-off are still required before the R1 migration DoD item can be closed.
- Telegram delivery is verified against a mock HTTP server; real bot credentials and a real chat must be configured and tested in staging.
- Browser/device checks on a real HTTPS domain and a physical printer remain operational acceptance tasks.
