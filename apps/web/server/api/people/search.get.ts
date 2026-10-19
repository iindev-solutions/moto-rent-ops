import { asc, inArray, or, sql } from 'drizzle-orm'
import type { PeopleSearchItem } from '@book-moto/contracts'
import { getDb, clients, clientContacts } from '@book-moto/db'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  await requireAppUser(event)
  const query = getQuery(event).q
  const term = typeof query === 'string' ? query.trim() : ''
  if (term.length < 2) return { people: [] as PeopleSearchItem[] }

  const db = await getDb()
  try {
    const pattern = `%${term}%`
    const rows = await db
      .select({ id: clients.id, displayName: clients.displayName })
      .from(clients)
      .where(or(
        sql`${clients.displayName} ilike ${pattern}`,
        sql`exists (select 1 from ${clientContacts} where ${clientContacts.clientId} = ${clients.id} and ${clientContacts.value} ilike ${pattern})`,
      ))
      .orderBy(asc(clients.displayName))
      .limit(8)

    const ids = rows.map(row => row.id)
    const phoneByClient = new Map<string, string>()
    const otherContactByClient = new Map<string, string>()
    if (ids.length > 0) {
      const contacts = await db
        .select({ clientId: clientContacts.clientId, channel: clientContacts.channel, value: clientContacts.value })
        .from(clientContacts)
        .where(inArray(clientContacts.clientId, ids))
        .orderBy(sql`${clientContacts.isPrimary} desc`)
      for (const contact of contacts) {
        if (contact.channel === 'phone') {
          if (!phoneByClient.has(contact.clientId)) phoneByClient.set(contact.clientId, contact.value)
        } else if (!otherContactByClient.has(contact.clientId)) {
          otherContactByClient.set(contact.clientId, contact.value)
        }
      }
    }

    const people: PeopleSearchItem[] = rows.map(row => ({
      id: row.id,
      displayName: row.displayName,
      phone: phoneByClient.get(row.id) ?? otherContactByClient.get(row.id) ?? null,
    }))

    return { people }
  } catch (error) {
    throwApiError(error)
  }
})
