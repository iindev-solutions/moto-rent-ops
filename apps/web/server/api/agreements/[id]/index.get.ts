import { and, desc, eq, inArray } from 'drizzle-orm'
import { getDb, attachments, rentalAgreements, rentalItems, motorcycles, clients, documentCustodies, returnInspections } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Agreement id is required' })

  const db = await getDb()
  try {
    const [agreement] = await db.select().from(rentalAgreements).where(eq(rentalAgreements.id, id)).limit(1)
    if (!agreement) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })

    const [client] = await db.select().from(clients).where(eq(clients.id, agreement.clientId)).limit(1)
    const items = await db.select({
      id: rentalItems.id,
      motorcycleId: rentalItems.motorcycleId,
      startDate: rentalItems.startDate,
      endDate: rentalItems.endDate,
      dailyRateMinor: rentalItems.dailyRateMinor,
      currency: rentalItems.currency,
      status: rentalItems.status,
      assetCode: motorcycles.assetCode,
      model: motorcycles.model,
      location: motorcycles.location,
      bikeStatus: motorcycles.status,
    }).from(rentalItems).innerJoin(motorcycles, eq(rentalItems.motorcycleId, motorcycles.id)).where(eq(rentalItems.agreementId, id))

    for (const item of items) {
      if (!canAccessLocation(user, item.location)) {
        throw createError({ statusCode: 403, statusMessage: 'Agreement is outside your location scope' })
      }
    }

    const itemIds = items.map(item => item.id)
    const inspections = itemIds.length > 0
      ? await db.select({ id: returnInspections.id, rentalItemId: returnInspections.rentalItemId }).from(returnInspections).where(inArray(returnInspections.rentalItemId, itemIds)).orderBy(desc(returnInspections.createdAt))
      : []
    const inspectionIds = inspections.map(inspection => inspection.id)
    const attachmentRows = inspectionIds.length > 0
      ? await db.select({ id: attachments.id, entityId: attachments.entityId }).from(attachments).where(inArray(attachments.entityId, inspectionIds))
      : []
    const attachmentsByInspection = new Map<string, Array<{ id: string }>>()
    for (const row of attachmentRows) {
      const list = attachmentsByInspection.get(row.entityId) ?? []
      list.push({ id: row.id })
      attachmentsByInspection.set(row.entityId, list)
    }
    const attachmentsByItem = new Map<string, Array<{ id: string }>>()
    for (const inspection of inspections) {
      if (attachmentsByItem.has(inspection.rentalItemId)) continue
      const list = attachmentsByInspection.get(inspection.id) ?? []
      if (list.length > 0) attachmentsByItem.set(inspection.rentalItemId, list)
    }

    const heldDocuments = await db.select().from(documentCustodies).where(and(eq(documentCustodies.clientId, agreement.clientId), eq(documentCustodies.status, 'held')))

    const blockers: string[] = []
    if (agreement.status === 'draft') {
      if (!client) blockers.push('Client is missing')
      if (items.length === 0) blockers.push('Add at least one motorcycle')
      if (heldDocuments.length === 0) blockers.push('Receive a physical document before handover')
      for (const item of items) {
        if (item.bikeStatus !== 'available') blockers.push(`${item.assetCode} is not available`)
      }
    }

    return {
      agreement: {
        id: agreement.id,
        clientId: agreement.clientId,
        status: agreement.status,
        version: agreement.version,
        startDate: agreement.startDate ? agreement.startDate.toISOString() : null,
        endDate: agreement.endDate ? agreement.endDate.toISOString() : null,
        notes: agreement.notes,
      },
      client: client ? { id: client.id, displayName: client.displayName } : null,
      items: items.map(item => ({
        id: item.id,
        motorcycleId: item.motorcycleId,
        startDate: item.startDate.toISOString(),
        endDate: item.endDate.toISOString(),
        dailyRateMinor: item.dailyRateMinor,
        currency: item.currency,
        status: item.status,
        assetCode: item.assetCode,
        model: item.model,
        attachments: attachmentsByItem.get(item.id) ?? [],
      })),
      blockers,
      heldDocumentCount: heldDocuments.length,
    }
  } catch (error) {
    throwApiError(error)
  }
})
