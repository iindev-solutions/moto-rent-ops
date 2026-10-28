import { and, desc, eq, lt, ne, or } from 'drizzle-orm'
import { getDb, recoveryDrills, users } from '@book-moto/db'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  requireRecoveryAdmin(user)

  const query = getQuery(event)
  const { limit } = readPagination(event, DEFAULT_LIMIT, MAX_LIMIT)
  const cursor = typeof query.cursor === 'string' ? query.cursor.trim() : ''
  if (cursor && !UUID_PATTERN.test(cursor)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid cursor' })
  }

  const db = await getDb()
  try {
    let cursorRow: { startedAt: Date, id: string } | undefined
    if (cursor) {
      [cursorRow] = await db.select({
        startedAt: recoveryDrills.startedAt,
        id: recoveryDrills.id,
      })
        .from(recoveryDrills)
        .where(and(
          eq(recoveryDrills.id, cursor),
          ne(recoveryDrills.status, 'running'),
        ))
        .limit(1)
      if (!cursorRow) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid cursor' })
      }
    }

    const terminal = ne(recoveryDrills.status, 'running')
    const where = cursorRow
      ? and(
          terminal,
          or(
            lt(recoveryDrills.startedAt, cursorRow.startedAt),
            and(
              eq(recoveryDrills.startedAt, cursorRow.startedAt),
              lt(recoveryDrills.id, cursorRow.id),
            ),
          ),
        )
      : terminal

    const rows = await db.select({
      id: recoveryDrills.id,
      status: recoveryDrills.status,
      startedAt: recoveryDrills.startedAt,
      finishedAt: recoveryDrills.finishedAt,
      targetEnvironment: recoveryDrills.targetEnvironment,
      artifactRef: recoveryDrills.artifactRef,
      manifestChecksum: recoveryDrills.manifestChecksum,
      failureCode: recoveryDrills.failureCode,
      operatorName: users.name,
    })
      .from(recoveryDrills)
      .innerJoin(users, eq(users.id, recoveryDrills.operatorUserId))
      .where(where)
      .orderBy(desc(recoveryDrills.startedAt), desc(recoveryDrills.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    if (hasMore) rows.pop()
    const drills = rows.map(row => serializeDrillListItem(row, row.operatorName))

    return {
      drills,
      nextCursor: hasMore ? drills[drills.length - 1]?.id ?? null : null,
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throwApiError(error)
  }
})
