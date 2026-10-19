import { z } from 'zod'
import { and, eq, notInArray } from 'drizzle-orm'
import { getDb, rentalItems, rentalAgreements, motorcycles, returnInspections, obligations, auditEvents } from '@book-moto/db'

const bodySchema = z.object({
  odometer: z.number().int().min(0).optional(),
  fuelLevel: z.string().trim().max(32).optional(),
  damageNotes: z.string().trim().max(2000).optional(),
  damageAmountMinor: z.number().int().min(0).default(0),
  checklist: z.record(z.string(), z.unknown()).default({}),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const itemId = getRouterParam(event, 'id')
  if (!itemId) throw createError({ statusCode: 400, statusMessage: 'Rental item id is required' })
  const parsed = bodySchema.safeParse((await readBody(event).catch(() => ({}))) ?? {})
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid return payload' })

  const db = await getDb()
  try {
    const inspectionId = await db.transaction(async (tx) => {
      const [item] = await tx.select().from(rentalItems).where(eq(rentalItems.id, itemId)).limit(1).for('update')
      if (!item) throw createError({ statusCode: 404, statusMessage: 'Rental item not found' })
      if (item.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'Rental item is not active' })

      const [agreement] = await tx.select().from(rentalAgreements).where(eq(rentalAgreements.id, item.agreementId)).limit(1)
      if (!agreement) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })
      if (agreement.status !== 'active') throw createError({ statusCode: 409, statusMessage: 'Agreement is not active' })

      const [bike] = await tx.select().from(motorcycles).where(eq(motorcycles.id, item.motorcycleId)).limit(1).for('update')
      if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Motorcycle not found' })

      const hasDamage = Boolean(parsed.data.damageNotes) || parsed.data.damageAmountMinor > 0

      const [inspection] = await tx.insert(returnInspections).values({
        rentalItemId: item.id,
        motorcycleId: item.motorcycleId,
        performedByUserId: user.id,
        odometer: parsed.data.odometer ?? null,
        fuelLevel: parsed.data.fuelLevel || null,
        checklist: parsed.data.checklist,
        damageNotes: parsed.data.damageNotes || null,
      }).returning()

      await tx.update(rentalItems).set({ status: 'returned', updatedAt: new Date() }).where(eq(rentalItems.id, item.id))

      const openItems = await tx
        .select({ id: rentalItems.id })
        .from(rentalItems)
        .where(and(
          eq(rentalItems.agreementId, agreement.id),
          notInArray(rentalItems.status, ['returned', 'cancelled']),
        ))
      if (openItems.length === 0) {
        await tx.update(rentalAgreements).set({ status: 'returned', updatedAt: new Date() }).where(eq(rentalAgreements.id, agreement.id))
      }

      await tx.update(motorcycles).set({
        status: hasDamage ? 'maintenance' : 'available',
        nextAction: hasDamage ? 'Repair damage' : 'Print QR label',
        updatedAt: new Date(),
      }).where(eq(motorcycles.id, item.motorcycleId))

      if (parsed.data.damageAmountMinor > 0) {
        await tx.insert(obligations).values({
          clientId: agreement.clientId,
          agreementId: agreement.id,
          rentalItemId: item.id,
          type: 'damage',
          status: 'planned',
          amountMinor: parsed.data.damageAmountMinor,
          currency: item.currency,
          dueDate: new Date(),
          notes: parsed.data.damageNotes || 'Damage charge',
        })
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'rental.return_completed',
        entityType: 'rental_item',
        entityId: item.id,
        location: bike.location,
        metadata: { agreementId: agreement.id, motorcycleId: item.motorcycleId, damageAmountMinor: parsed.data.damageAmountMinor, inspectionId: inspection?.id ?? null },
      })

      return inspection?.id ?? null
    })

    return { returned: true, inspectionId }
  } catch (error) {
    throwApiError(error)
  }
})
