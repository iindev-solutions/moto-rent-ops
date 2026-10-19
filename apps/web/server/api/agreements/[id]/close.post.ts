import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, rentalAgreements, rentalItems, motorcycles, auditEvents } from '@book-moto/db'

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) throw createError({ statusCode: 400, statusMessage: 'Agreement id is required' })
  const parsed = bodySchema.safeParse((await readBody(event).catch(() => ({}))) ?? {})
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid close payload' })

  const db = await getDb()
  try {
    await db.transaction(async (tx) => {
      const [agreement] = await tx.select().from(rentalAgreements).where(eq(rentalAgreements.id, agreementId)).limit(1).for('update')
      if (!agreement) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })
      if (agreement.status !== 'returned') throw createError({ statusCode: 409, statusMessage: 'Agreement must be returned before closing' })

      const items = await tx
        .select({ location: motorcycles.location })
        .from(rentalItems)
        .innerJoin(motorcycles, eq(motorcycles.id, rentalItems.motorcycleId))
        .where(eq(rentalItems.agreementId, agreementId))

      for (const { location } of items) {
        if (!canAccessLocation(user, location)) {
          throw createError({ statusCode: 403, statusMessage: 'Agreement is outside your location scope' })
        }
      }

      await tx.update(rentalAgreements).set({ status: 'closed', updatedAt: new Date() }).where(eq(rentalAgreements.id, agreementId))

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'rental.agreement_closed',
        entityType: 'rental_agreement',
        entityId: agreementId,
        reason: parsed.data.reason || 'Agreement closed',
      })
    })

    return { closed: true }
  } catch (error) {
    throwApiError(error)
  }
})
