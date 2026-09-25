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
5. Start Nuxt: `npm run dev`.

PGlite persists to `.data/pglite`; the local filesystem storage adapter uses `.data/documents`. Docker is optional and is not required for the default development path. Production uses managed PostgreSQL and VNPT/S3 through the same interfaces.

## Product invariants

- QR identifies a physical motorcycle, not a rental or client.
- QR contains no PII and is not an authorization credential.
- Authenticated app routes are `ssr: false` and API responses use `no-store`.
- Business rules and SQL do not depend on Nuxt components or route handlers.
- Financial state is derived from immutable facts; there is no `paid` boolean.
- Worker/outbox is a separate process.
- Passport scans are not stored. A physical document is represented by custody events and masked metadata only; cash deposits use the 2M/5M VND options.

See `ROADMAP.md` for the phased delivery plan.
