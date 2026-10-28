<!--
Sync Impact Report
Version change: none → 1.0.0
Modified principles: initial adoption (all principles new)
Added sections: Core Principles, Technical Constraints, Development Workflow & Quality Gates, Governance
Removed sections: none
Follow-up TODOs: none
-->

# MOTO//OPS Constitution

## Core Principles

### I. Verified Change (NON-NEGOTIABLE)

A change is not done until the current change set has fresh evidence: `npm run typecheck`,
`npm test`, and `npm run build` pass. Bug fixes MUST reproduce the reported symptom first and
prove it is gone after the fix. A failed command MUST be diagnosed from its full error before
any retry. When verification is impossible, the exact unverified surface and the reason MUST be
reported instead of claiming success.

Rationale: this system controls cash, deposits, contracts, and personal data. An unverified
change is an operational risk, not a draft.

### II. Financial and Audit Truth (NON-NEGOTIABLE)

Financial state MUST be derived from immutable facts. There is no `paid` boolean and no mutable
balance used as the source of truth. Receipts, allocations, deposits, and corrections are
append-only facts; corrections are new records, never edits to history. Database constraints MUST
enforce financial invariants. Every money-moving operation MUST be idempotent, and replaying a
request MUST NOT create a second payment. Reads that disclose masked document requisites or
custody metadata MUST write an `audit_events` row before the response is returned. No network
call may run inside a database transaction; outbox journaling stays transactional with the
business write.

Rationale: operators reconcile real cash and deposits. Silent drift or a duplicated payment
destroys trust in the system and cannot be repaired by a UI message.

### III. PII and QR Boundary (NON-NEGOTIABLE)

A QR code identifies a physical motorcycle only — never a rental, a client, or an authorization
credential. QR payloads, deep links, notifications, logs, and caches MUST NOT contain PII beyond
what the specific flow requires. Passport scans are never stored; a physical document is
represented only by custody events and masked metadata. Public endpoints MUST expose the minimum
fields needed by the customer flow and MUST return 404 for unknown or revoked tokens so probing
reveals nothing. Notifications are plain text without document numbers, phone numbers, or email;
financial messages are internal records, not payment confirmations. Logs and error responses MUST
redact secrets and PII.

Rationale: QR stickers are physical, public, and long-lived. A leaked token or cached card must
never become a path to a client, a passport, or financial data.

### IV. Portable Domain Core and Explicit Boundaries

Business rules and SQL MUST live in `packages/domain` and `packages/db` and MUST NOT depend on Nuxt
components or route handlers. Shared API shapes live in `packages/contracts`; changes there MUST
keep existing consumers and cached cards compatible. Schema changes MUST ship as versioned SQL
migrations with a matching snapshot; applied migrations are immutable. Storage and notification
providers MUST sit behind adapters so development (PGlite, local filesystem) and production
(managed PostgreSQL, S3-compatible storage) use the same interfaces. The outbox worker remains a
separate supervised process. Prefer the smallest change that preserves these boundaries; new
infrastructure requires a demonstrated need, an owner, and a rollback path.

Rationale: the domain must remain testable without a browser, and the production topology must be
swappable without rewriting business logic.

### V. Offline Honesty and Operational Readiness

The UI MUST NOT show a false "saved" or "paid" state while offline. Money, contracts, PII, and
documents require fresh server confirmation; only low-PII, read-only data may be cached, and the
cache MUST show its age and offline state. Health and readiness checks MUST probe real
dependencies. Production configuration MUST be validated at startup, and deployment without
backup, restore, and rollback runbooks is incomplete. Every production-facing feature MUST have
acceptance evidence on a real HTTPS origin and on supported Android/iPhone browsers where the
flow depends on the camera or PWA behavior.

Rationale: a rental counter works on a weak connection. Optimistic UI that lies about money is
worse than an explicit offline banner.

## Technical Constraints

- Runtime: Node.js >= 22, TypeScript strict mode, Nuxt 4 + Vue 3 + Nitro.
- UI: Nuxt UI + Tailwind CSS; user-facing strings live in `apps/web/app/locales/en.json` and
  `vi.json` — no hard-coded copy in components.
- Data: PostgreSQL with Drizzle ORM; PGlite is the development/test database only. Production
  MUST use managed PostgreSQL and run the same SQL migrations.
- Storage: S3-compatible adapter in production; the local filesystem adapter is development-only.
- Scanner: native `BarcodeDetector` with a mandatory `zxing-wasm` fallback for Safari/iOS.
- Delivery: PostgreSQL-backed transactional outbox; Telegram is an adapter, not a source of truth.
- Commits follow Conventional Commits. Demo and test environments use synthetic data only; real
  PII is allowed only in approved staging/production environments.
- A new runtime dependency requires a stated need, a security review, and a removal path.

## Development Workflow & Quality Gates

- Every change runs `npm run typecheck`, `npm test`, and `npm run build`. CI runs the same three
  gates on Node 22.
- Tests use Vitest. End-to-end PGlite data directories MUST live inside the OS temp directory; a
  test run MUST never wipe a developer or demo database.
- Database changes: `npm run db:generate`, then `npm run db:migrate`, then verify with
  `npm run db:seed`. Migrations are reviewed together with their snapshot.
- Security-sensitive changes require an explicit threat consideration, audit coverage, and a
  check that secrets and PII do not reach logs, URLs, notifications, or caches.
- Changes stay surgical: no drive-by refactors, no unrelated formatting churn, no silent behavior
  changes hidden inside a rename.
- Update `ROADMAP.md` and the daily `memory/` note when a phase gate or known limitation changes.
- Review the final diff before committing. Commits are small, conventional, and explain why.

## Governance

This constitution supersedes conflicting local habits and ad-hoc instructions. When a practice
conflicts with a principle, the principle wins until it is formally amended.

Amendments require a documented proposal (pull request or commit) that states the version bump,
the rationale, and the migration or operational impact. The project owner approves amendments.
Versioning follows semantic rules: MAJOR for removing or redefining a principle, MINOR for adding
a principle or materially expanding guidance, PATCH for clarifications that do not change meaning.

Every `/speckit.plan`, `/speckit.tasks`, and `/speckit.implement` run MUST verify compliance with
this document. Added complexity MUST be justified against the simplest compliant alternative.
Compliance is reviewed at each phase gate; an unresolved violation blocks release.

Runtime guidance lives in `README.md`, `ROADMAP.md`, `AGENTS.md`, and the `memory/` notes. The
constitution governs how those documents are interpreted, not the other way around.

**Version**: 1.0.0 | **Ratified**: 2026-10-28 | **Last Amended**: 2026-10-28
