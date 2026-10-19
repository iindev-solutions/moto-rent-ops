import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { getDb, rentalItems, rentalAgreements, motorcycles, obligations, allocations, auditEvents } from '@book-moto/db'

const DAY_MS = 24 * 60 * 60 * 1000

const bodySchema = z.object({
  days: z.number().int().min(1).max(30),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const itemId = getRouterParam(event, 'id')
  if (!itemId) throw createError({ statusCode: 400, statusMessage: 'Rental item id is required' })
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid extend payload' })

  const db = await getDb()
  try {
    const result = await db.transaction(async (tx) => {
      const [item] = await tx.select().from(rentalItems).where(eq(rentalItems.id, itemId)).limit(1).for('update')
      if (!item) throw createError({ statusCode: 404, statusMessage: 'Rental item not found' })
      if (item.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'Only active rentals can be extended' })

      const [agreement] = await tx.select().from(rentalAgreements).where(eq(rentalAgreements.id, item.agreementId)).limit(1).for('update')
      if (!agreement) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })

      const [bike] = await tx.select({ location: motorcycles.location }).from(motorcycles).where(eq(motorcycles.id, item.motorcycleId)).limit(1)
      if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Motorcycle not found' })

      const newEndDate = new Date(item.endDate.getTime() + parsed.data.days * DAY_MS)
      await tx.update(rentalItems).set({ endDate: newEndDate, updatedAt: new Date() }).where(eq(rentalItems.id, itemId))

      const agreementEndDate = agreement.endDate && agreement.endDate > newEndDate ? agreement.endDate : newEndDate
      await tx.update(rentalAgreements).set({ endDate: agreementEndDate, updatedAt: new Date() }).where(eq(rentalAgreements.id, agreement.id))

      const newDays = Math.max(1, Math.ceil((newEndDate.getTime() - item.startDate.getTime()) / DAY_MS))
      const rentAmountMinor = item.dailyRateMinor * newDays
      const [rentObligation] = await tx
        .select({ id: obligations.id })
        .from(obligations)
        .where(and(eq(obligations.rentalItemId, itemId), eq(obligations.type, 'rent')))
        .limit(1)
      if (rentObligation) {
        const allocatedRows = await tx
          .select({ allocated: sql<number>`coalesce(sum(${allocations.amountMinor}), 0)::int` })
          .from(allocations)
          .where(eq(allocations.obligationId, rentObligation.id))
        const allocated = allocatedRows[0]?.allocated ?? 0
        await tx.update(obligations).set({
          amountMinor: Math.max(rentAmountMinor, allocated),
          dueDate: newEndDate,
          updatedAt: new Date(),
        }).where(eq(obligations.id, rentObligation.id))
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'rental.item_extended',
        entityType: 'rental_item',
        entityId: itemId,
        location: bike.location,
        metadata: { days: parsed.data.days, newEndDate: newEndDate.toISOString(), rentAmountMinor },
      })

      return { endDate: newEndDate.toISOString(), rentAmountMinor }
    })

    return { extended: true, ...result }
  } catch (error) {
    throwApiError(error)
  }
})
