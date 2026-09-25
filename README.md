# Book Moto

Production-first motorcycle rental operations PWA.

## Stack

- Nuxt 4 + Vue 3 + Nitro
- Nuxt UI + Tailwind CSS
- PostgreSQL + Drizzle ORM
- S3-compatible private storage (MinIO locally, VNPT/S3 in production)
- PostgreSQL-backed worker/outbox
- `zxing-wasm` scanner fallback with native `BarcodeDetector` enhancement

## Local development

1. Copy `.env.example` to `.env` and set a 32-byte base64 `TOKEN_ENCRYPTION_KEY`.
2. Start infrastructure: `docker compose up -d`.
3. Install dependencies: `npm install`.
4. Generate/apply migrations: `npm run db:generate && npm run db:migrate`.
5. Seed local development records: `npm run db:seed`.
6. Start Nuxt: `npm run dev`.

The local environment uses the same application code, migrations, adapters and acceptance flows as production. There is no separate demo application or runtime mode.

## Product invariants

- QR identifies a physical motorcycle, not a rental or client.
- QR contains no PII and is not an authorization credential.
- Authenticated app routes are `ssr: false` and API responses use `no-store`.
- Business rules and SQL do not depend on Nuxt components or route handlers.
- Financial state is derived from immutable facts; there is no `paid` boolean.
- Worker/outbox is a separate process.
- Passport files require private storage, explicit authorization and audit.

See `ROADMAP.md` for the phased delivery plan.
