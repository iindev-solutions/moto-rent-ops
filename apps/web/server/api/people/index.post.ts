import { z } from 'zod'
import { getDb, clients, clientContacts, auditEvents } from '@book-moto/db'

const bodySchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  preferredChannel: z.string().trim().min(2).max(32).default('phone'),
  notes: z.string().trim().max(2000).optional(),
  contacts: z.array(z.object({
    channel: z.string().trim().min(2).max(32),
    value: z.string().trim().min(2).max(240),
    isPrimary: z.boolean().default(false),
  })).default([]),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid client payload' })
  }

  const db = await getDb()
  try {
    const result = await db.transaction(async (tx) => {
      const [client] = await tx.insert(clients).values({
        displayName: parsed.data.displayName,
        preferredChannel: parsed.data.preferredChannel,
        notes: parsed.data.notes || null,
      }).returning()

      if (!client) throw createError({ statusCode: 500, statusMessage: 'Could not create client' })

      if (parsed.data.contacts.length) {
        await tx.insert(clientContacts).values(parsed.data.contacts.map(contact => ({
          clientId: client.id,
          channel: contact.channel,
          value: contact.value,
          isPrimary: contact.isPrimary,
        })))
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'client.created',
        entityType: 'client',
        entityId: client.id,
        metadata: { displayName: client.displayName, contactCount: parsed.data.contacts.length },
      })

      return client
    })

    return { client: result }
  } catch (error) {
    throwApiError(error)
  }
})
