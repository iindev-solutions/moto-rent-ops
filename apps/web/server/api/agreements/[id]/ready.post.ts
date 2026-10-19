import { and, eq } from 'drizzle-orm'
import { getDb, rentalAgreements, rentalItems, motorcycles, documentCustodies, auditEvents } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const agreementId = getRouterParam(event, 'id')
  if (!agreementId) throw createError({ statusCode: 400, statusMessage: 'Agreement id is required' })

  const db = await getDb()
  try {
    await db.transaction(async (tx) => {
      const [agreement] = await tx.select().from(rentalAgreements).where(eq(rentalAgreements.id, agreementId)).limit(1)
      if (!agreement) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })
      if (agreement.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'Agreement is not a draft' })

      const items = await tx.select().from(rentalItems).where(eq(rentalItems.agreementId, agreementId))
      if (items.length === 0) throw createError({ statusCode: 409, statusMessage: 'Add at least one motorcycle' })

      const heldDocuments = await tx.select().from(documentCustodies).where(and(eq(documentCustodies.clientId, agreement.clientId), eq(documentCustodies.status, 'held')))
      if (heldDocuments.length === 0) throw createError({ statusCode: 409, statusMessage: 'Receive a physical document before handover' })

      for (const item of items) {
        if (item.status !== 'planned') throw createError({ statusCode: 409, statusMessage: 'Every rental item must be planned' })
        const [bike] = await tx.select().from(motorcycles).where(eq(motorcycles.id, item.motorcycleId)).limit(1)
        if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Motorcycle not found' })
        if (bike.status !== 'available') throw createError({ statusCode: 409, statusMessage: 'Every motorcycle must be available' })
      }

      await tx.update(rentalAgreements).set({ status: 'ready', updatedAt: new Date() }).where(eq(rentalAgreements.id, agreementId))
      for (const item of items) {
        await tx.update(motorcycles).set({ status: 'reserved', nextAction: 'Handover pending', updatedAt: new Date() }).where(eq(motorcycles.id, item.motorcycleId))
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'rental.agreement_ready',
        entityType: 'rental_agreement',
        entityId: agreementId,
        metadata: { itemCount: items.length, heldDocumentCount: heldDocuments.length },
      })
    })

    return { ready: true }
  } catch (error) {
    throwApiError(error)
  }
})
