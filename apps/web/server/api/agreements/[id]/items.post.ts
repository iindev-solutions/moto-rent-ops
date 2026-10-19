import { z } from 'zod'
import { and, eq, gt, inArray, lt } from 'drizzle-orm'
import { getDb, rentalItems, rentalAgreements, motorcycles, auditEvents } from '@book-moto/db'

const bodySchema = z.object({
  motorcycleId: z.string().uuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  dailyRateMinor: z.number().int().min(0).default(0),
  currency: z.string().trim().length(3).default('VND'),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) throw createError({ statusCode: 400, statusMessage: 'Agreement id is required' })
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid rental item payload' })

  const startDate = new Date(parsed.data.startDate)
  const endDate = new Date(parsed.data.endDate)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid rental dates' })
  }
  if (endDate <= startDate) throw createError({ statusCode: 400, statusMessage: 'End date must be after start date' })

  const db = await getDb()
  try {
    const item = await db.transaction(async (tx) => {
      const [agreement] = await tx.select().from(rentalAgreements).where(eq(rentalAgreements.id, agreementId)).limit(1).for('update')
      if (!agreement) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })
      if (agreement.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Agreement is not editable' })

      const [bike] = await tx.select().from(motorcycles).where(eq(motorcycles.id, parsed.data.motorcycleId)).limit(1).for('update')
      if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Motorcycle not found' })

      const overlapping = await tx.select({ id: rentalItems.id }).from(rentalItems).where(and(
        eq(rentalItems.motorcycleId, parsed.data.motorcycleId),
        inArray(rentalItems.status, ['planned', 'active']),
        lt(rentalItems.startDate, endDate),
        gt(rentalItems.endDate, startDate),
      )).limit(1)
      if (overlapping.length > 0) throw createError({ statusCode: 409, statusMessage: 'Motorcycle is already booked for overlapping dates' })

      const [row] = await tx.insert(rentalItems).values({
        agreementId,
        motorcycleId: parsed.data.motorcycleId,
        startDate,
        endDate,
        dailyRateMinor: parsed.data.dailyRateMinor,
        currency: parsed.data.currency,
        status: 'planned',
      }).returning()

      if (!row) throw createError({ statusCode: 500, statusMessage: 'Could not add rental item' })

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'rental.item_added',
        entityType: 'rental_agreement',
        entityId: agreementId,
        location: bike.location,
        metadata: { motorcycleId: parsed.data.motorcycleId, assetCode: bike.assetCode },
      })

      return row
    })

    return { item }
  } catch (error) {
    throwApiError(error)
  }
})
