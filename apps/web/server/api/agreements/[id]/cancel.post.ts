import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, rentalAgreements, rentalItems, motorcycles, auditEvents } from '@book-moto/db'

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(500),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) throw createError({ statusCode: 400, statusMessage: 'Agreement id is required' })
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Cancellation reason is required' })

  const db = await getDb()
  try {
    await db.transaction(async (tx) => {
      const [agreement] = await tx.select().from(rentalAgreements).where(eq(rentalAgreements.id, agreementId)).limit(1).for('update')
      if (!agreement) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })
      if (!['draft', 'ready'].includes(agreement.status)) throw createError({ statusCode: 409, statusMessage: 'Only draft or ready agreements can be cancelled' })

      const items = await tx
        .select({ item: rentalItems, location: motorcycles.location })
        .from(rentalItems)
        .innerJoin(motorcycles, eq(motorcycles.id, rentalItems.motorcycleId))
        .where(eq(rentalItems.agreementId, agreementId))

      for (const { location } of items) {
        if (!canAccessLocation(user, location)) {
          throw createError({ statusCode: 403, statusMessage: 'Agreement is outside your location scope' })
        }
      }

      await tx.update(rentalAgreements).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(rentalAgreements.id, agreementId))

      await tx.update(rentalItems)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(rentalItems.agreementId, agreementId), eq(rentalItems.status, 'planned')))

      if (agreement.status === 'ready') {
        for (const { item } of items) {
          await tx.update(motorcycles)
            .set({ status: 'available', nextAction: 'Print QR label', updatedAt: new Date() })
            .where(and(eq(motorcycles.id, item.motorcycleId), eq(motorcycles.status, 'reserved')))
        }
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'rental.agreement_cancelled',
        entityType: 'rental_agreement',
        entityId: agreementId,
        reason: parsed.data.reason,
        metadata: { previousStatus: agreement.status, itemCount: items.length },
      })
    })

    return { cancelled: true }
  } catch (error) {
    throwApiError(error)
  }
})
