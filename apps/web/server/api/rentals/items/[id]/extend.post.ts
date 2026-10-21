import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, rentalItems, rentalAgreements, motorcycles, obligations, auditEvents } from '@book-moto/db'

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

      // Extension is a new immutable financial fact. Never mutate the original rent obligation.
      const extensionAmountMinor = item.dailyRateMinor * parsed.data.days
      const [extension] = await tx.insert(obligations).values({
        clientId: agreement.clientId,
        agreementId: agreement.id,
        rentalItemId: item.id,
        type: 'rent_extension',
        amountMinor: extensionAmountMinor,
        currency: item.currency,
        dueDate: newEndDate,
        notes: `Rent extension for ${parsed.data.days} day(s)`,
      }).returning()

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'rental.item_extended',
        entityType: 'rental_item',
        entityId: itemId,
        location: bike.location,
        metadata: {
          days: parsed.data.days,
          newEndDate: newEndDate.toISOString(),
          extensionAmountMinor,
          extensionObligationId: extension?.id ?? null,
        },
      })

      return { endDate: newEndDate.toISOString(), extensionAmountMinor }
    })

    return { extended: true, ...result }
  } catch (error) {
    throwApiError(error)
  }
})
