import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, clientContacts, auditEvents, clients } from '@book-moto/db'

const bodySchema = z.object({
  channel: z.string().trim().min(2).max(32),
  value: z.string().trim().min(2).max(240),
  isPrimary: z.boolean().default(false),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const clientId = getRouterParam(event, 'id')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Client id is required' })
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid contact payload' })

  const db = await getDb()
  try {
    const contact = await db.transaction(async (tx) => {
      const [client] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1)
      if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

      const [row] = await tx.insert(clientContacts).values({
        clientId,
        channel: parsed.data.channel,
        value: parsed.data.value,
        isPrimary: parsed.data.isPrimary,
      }).returning()

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'client.contact_added',
        entityType: 'client',
        entityId: clientId,
        metadata: { channel: parsed.data.channel },
      })

      return row
    })

    return { contact }
  } catch (error) {
    throwApiError(error)
  }
})
