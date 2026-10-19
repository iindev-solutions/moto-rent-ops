import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, rentalItems, rentalAgreements, motorcycles, handovers, obligations, auditEvents } from '@book-moto/db'

const bodySchema = z.object({
  odometer: z.number().int().min(0).optional(),
  fuelLevel: z.string().trim().max(32).optional(),
  damageNotes: z.string().trim().max(2000).optional(),
  checklist: z.record(z.string(), z.unknown()).default({}),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const itemId = getRouterParam(event, 'id')
  if (!itemId) throw createError({ statusCode: 400, statusMessage: 'Rental item id is required' })
  const parsed = bodySchema.safeParse((await readBody(event).catch(() => ({}))) ?? {})
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid handover payload' })

  const db = await getDb()
  try {
    await db.transaction(async (tx) => {
      const [item] = await tx.select().from(rentalItems).where(eq(rentalItems.id, itemId)).limit(1).for('update')
      if (!item) throw createError({ statusCode: 404, statusMessage: 'Rental item not found' })
      if (item.status !== 'planned') throw createError({ statusCode: 409, statusMessage: 'Rental item is not awaiting handover' })

      const [agreement] = await tx.select().from(rentalAgreements).where(eq(rentalAgreements.id, item.agreementId)).limit(1)
      if (!agreement || !['ready', 'active'].includes(agreement.status)) throw createError({ statusCode: 409, statusMessage: 'Agreement is not ready' })

      const [bike] = await tx.select().from(motorcycles).where(eq(motorcycles.id, item.motorcycleId)).limit(1).for('update')
      if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Motorcycle not found' })
      if (!['available', 'reserved'].includes(bike.status)) throw createError({ statusCode: 409, statusMessage: 'Motorcycle is not available' })

      const [handover] = await tx.insert(handovers).values({
        rentalItemId: item.id,
        motorcycleId: item.motorcycleId,
        performedByUserId: user.id,
        odometer: parsed.data.odometer ?? null,
        fuelLevel: parsed.data.fuelLevel || null,
        checklist: parsed.data.checklist,
        damageNotes: parsed.data.damageNotes || null,
      }).returning()

      if (!handover) throw createError({ statusCode: 500, statusMessage: 'Could not record handover' })

      await tx.update(rentalItems).set({ status: 'active', updatedAt: new Date() }).where(eq(rentalItems.id, item.id))
      await tx.update(rentalAgreements).set({ status: 'active', updatedAt: new Date() }).where(eq(rentalAgreements.id, agreement.id))
      await tx.update(motorcycles).set({
        status: 'rented',
        nextAction: 'Return check',
        updatedAt: new Date(),
      }).where(eq(motorcycles.id, item.motorcycleId))

      const days = Math.max(1, Math.ceil((item.endDate.getTime() - item.startDate.getTime()) / 86400000))
      await tx.insert(obligations).values({
        clientId: agreement.clientId,
        agreementId: agreement.id,
        rentalItemId: item.id,
        type: 'rent',
        status: 'planned',
        amountMinor: item.dailyRateMinor * days,
        currency: item.currency,
        dueDate: item.endDate,
        notes: 'Rent for rental period',
      })

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'rental.handover_completed',
        entityType: 'rental_item',
        entityId: item.id,
        location: bike.location,
        metadata: { agreementId: agreement.id, motorcycleId: item.motorcycleId, odometer: parsed.data.odometer ?? null },
      })
    })

    return { handedOver: true }
  } catch (error) {
    throwApiError(error)
  }
})
