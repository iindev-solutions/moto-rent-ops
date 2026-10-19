import { desc, eq, sql } from 'drizzle-orm'
import { getDb, clients, clientContacts, documentCustodies, rentalAgreements } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  await requireAppUser(event)
  const db = await getDb()

  try {
    const rows = await db
      .select({
        id: clients.id,
        displayName: clients.displayName,
        preferredChannel: clients.preferredChannel,
        contactCount: sql<number>`count(distinct ${clientContacts.id})::int`,
        openDocumentCount: sql<number>`count(distinct case when ${documentCustodies.status} = 'held' then ${documentCustodies.id} end)::int`,
        activeAgreementCount: sql<number>`count(distinct case when ${rentalAgreements.status} in ('ready','active') then ${rentalAgreements.id} end)::int`,
      })
      .from(clients)
      .leftJoin(clientContacts, eq(clientContacts.clientId, clients.id))
      .leftJoin(documentCustodies, eq(documentCustodies.clientId, clients.id))
      .leftJoin(rentalAgreements, eq(rentalAgreements.clientId, clients.id))
      .groupBy(clients.id)
      .orderBy(desc(clients.createdAt))

    return { clients: rows }
  } catch (error) {
    throwApiError(error)
  }
})
