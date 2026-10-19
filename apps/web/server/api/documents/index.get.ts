import { desc, inArray } from 'drizzle-orm'
import { getDb, clients, documentCustodies } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  await requireAppUser(event)
  const db = await getDb()
  try {
    const documents = await db.select().from(documentCustodies).orderBy(desc(documentCustodies.receivedAt))
    const clientIds = [...new Set(documents.map(document => document.clientId))]
    const clientRows = clientIds.length > 0
      ? await db.select({ id: clients.id, displayName: clients.displayName }).from(clients).where(inArray(clients.id, clientIds))
      : []
    const clientNames = new Map(clientRows.map(client => [client.id, client.displayName]))

    return {
      documents: documents.map(document => ({
        id: document.id,
        clientId: document.clientId,
        clientName: clientNames.get(document.clientId) ?? null,
        documentType: document.documentType,
        maskedNumber: document.maskedNumber,
        status: document.status,
        receivedAt: document.receivedAt.toISOString(),
        returnedAt: document.returnedAt ? document.returnedAt.toISOString() : null,
      })),
    }
  } catch (error) {
    throwApiError(error)
  }
})
