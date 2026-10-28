import { asc, eq } from 'drizzle-orm'
import { getDb, recoveryDrillScopes, recoveryDrills, users } from '@book-moto/db'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  requireRecoveryAdmin(user)

  const id = getRouterParam(event, 'id')?.trim() ?? ''
  if (!UUID_PATTERN.test(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Recovery drill not found' })
  }

  const db = await getDb()
  try {
    const [drill] = await db.select({
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
      .where(eq(recoveryDrills.id, id))
      .limit(1)

    if (!drill) {
      throw createError({ statusCode: 404, statusMessage: 'Recovery drill not found' })
    }

    const scopes = await db.select({
      scope: recoveryDrillScopes.scope,
      expectedCount: recoveryDrillScopes.expectedCount,
      actualCount: recoveryDrillScopes.actualCount,
      expectedTotalMinor: recoveryDrillScopes.expectedTotalMinor,
      actualTotalMinor: recoveryDrillScopes.actualTotalMinor,
      currency: recoveryDrillScopes.currency,
      status: recoveryDrillScopes.status,
      mismatchCode: recoveryDrillScopes.mismatchCode,
    })
      .from(recoveryDrillScopes)
      .where(eq(recoveryDrillScopes.drillId, id))
      .orderBy(asc(recoveryDrillScopes.scope))

    return serializeDrillDetail(drill, scopes, drill.operatorName)
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throwApiError(error)
  }
})
