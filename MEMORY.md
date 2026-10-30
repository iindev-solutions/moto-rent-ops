# MEMORY.md — MOTO//OPS

Платформа операционного учёта аренды мотоциклов. Оператору: выдача байка, деньги, депозиты,
залоги, ТО, возвраты. Репозиторий `iindev-solutions/moto-rent-ops`.

## Стек

Nuxt 4 + Vue 3 + Nitro · Nuxt UI + Tailwind · PostgreSQL + Drizzle ORM (PGlite в dev,
managed PG в prod) · S3-совместимое хранилище (local adapter в dev, VNPT/S3 в prod) ·
PostgreSQL-воркер/outbox · PWA · `zxing-wasm` с fallback на `BarcodeDetector`.

## Непоколебимые инварианты (из ROADMAP)

- QR идентифицирует физический мотоцикл, не аренду и не клиента
- QR не несёт PII и не является авторизационным кредом
- Аутентифицированные маршруты — `ssr: false`; API-ответы — `no-store`
- Бизнес-правила и SQL не зависят от Nuxt-компонентов и route-обработчиков
- Финансовое состояние выводится из неизменяемых фактов: колонки `paid` не существует
  (obligations → receipts → allocations, статус считается на лету)
- Воркер/outbox — отдельный процесс
- Сканы паспортов не хранятся: только custody-события и маскированные метаданные
- Денежные суммы — в minor units (bigint)

## Где мы сейчас (28.10.2026)

- 24.10: Phase 6 hardening и legacy import закоммичены локально (последний `7c36782`), не запушены
- 24.10: outbox/Telegram (`f164502`), PWA offline card, QR-метки, финансовые guard'ы, версии договоров
- 28.10: демо-QR работа закоммичена в `9a7a8cb` на ветке `spec-kit/adoption`:
  публичная карточка `/b/{token}` без логина, `photo_url` + миграция 0019, фото байков,
  HTTPS-туннель, фикс secure-cookie, trailing slash, защита тестовой БД от затирания
- Проверка WIP: `npm run typecheck` — 0 ошибок; `npm test` — 49/49
- 28.10: принят Spec Kit 1.2.4 (opencode integration). Конституция `1.0.0` в
  `.specify/memory/constitution.md`; первый spec `specs/001-backup-restore-drill/`
  (spec + plan + research + data-model + contracts + quickstart + 47 tasks)
- Дальше: implement US1 (CLI backup/restore/drill + evidence), затем readiness/evidence UI
- Открытые блокеры R1: реальный legacy-снимок и сверка владельцем, прод-деплой и креды,
  реальный Telegram, физический принтер/устройства, backup/restore drill, pilot sign-off
- Детальные логи: `memory/2026-10-24.md`, `memory/2026-10-28.md`

## Правила работы здесь

- Коммитить слоями (db → api → ui) и пушить — работа уже терялась один раз за три недели
- `npm run typecheck` должен проходить чисто перед коммитом
- Деньги не трогаются без транзакций с `for('update')` по строкам денежных сущностей
