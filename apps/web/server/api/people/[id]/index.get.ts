import { count, eq, inArray } from 'drizzle-orm'
import { getDb, attachments, clients, clientContacts, documentCustodies, rentalAgreements, rentalItems } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  await requireAppUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Client id is required' })

  const db = await getDb()
  try {
    const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1)
    if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

    const contacts = await db.select({
      id: clientContacts.id,
      channel: clientContacts.channel,
      value: clientContacts.value,
      isPrimary: clientContacts.isPrimary,
    }).from(clientContacts).where(eq(clientContacts.clientId, id))

    const documents = await db.select({
      id: documentCustodies.id,
      documentType: documentCustodies.documentType,
      maskedNumber: documentCustodies.maskedNumber,
      status: documentCustodies.status,
      receivedAt: documentCustodies.receivedAt,
      returnedAt: documentCustodies.returnedAt,
      notes: documentCustodies.notes,
    }).from(documentCustodies).where(eq(documentCustodies.clientId, id))

    const agreements = await db.select().from(rentalAgreements).where(eq(rentalAgreements.clientId, id))
    const agreementIds = agreements.map(agreement => agreement.id)
    const itemCounts = new Map<string, number>()
    if (agreementIds.length > 0) {
      const itemCountRows = await db
        .select({ agreementId: rentalItems.agreementId, itemCount: count() })
        .from(rentalItems)
        .where(inArray(rentalItems.agreementId, agreementIds))
        .groupBy(rentalItems.agreementId)
      for (const row of itemCountRows) {
        itemCounts.set(row.agreementId, Number(row.itemCount))
      }
    }

    const documentIds = documents.map(doc => doc.id)
    const attachmentsByDocument = new Map<string, Array<{ id: string, contentType: string }>>()
    if (documentIds.length > 0) {
      const attachmentRows = await db
        .select({ id: attachments.id, entityId: attachments.entityId, contentType: attachments.contentType })
        .from(attachments)
        .where(inArray(attachments.entityId, documentIds))
      for (const row of attachmentRows) {
        const list = attachmentsByDocument.get(row.entityId) ?? []
        list.push({ id: row.id, contentType: row.contentType })
        attachmentsByDocument.set(row.entityId, list)
      }
    }

    return {
      client: {
        id: client.id,
        displayName: client.displayName,
        preferredChannel: client.preferredChannel,
        notes: client.notes,
        contactCount: contacts.length,
        openDocumentCount: documents.filter(doc => doc.status === 'held').length,
        activeAgreementCount: agreements.filter(agreement => ['ready', 'active'].includes(agreement.status)).length,
      },
      contacts,
      documents: documents.map(doc => ({
        ...doc,
        receivedAt: doc.receivedAt.toISOString(),
        returnedAt: doc.returnedAt ? doc.returnedAt.toISOString() : null,
        attachments: attachmentsByDocument.get(doc.id) ?? [],
      })),
      agreements: agreements.map(agreement => ({
        id: agreement.id,
        status: agreement.status,
        version: agreement.version,
        startDate: agreement.startDate ? agreement.startDate.toISOString() : null,
        endDate: agreement.endDate ? agreement.endDate.toISOString() : null,
        itemCount: itemCounts.get(agreement.id) ?? 0,
      })),
    }
  } catch (error) {
    throwApiError(error)
  }
})
