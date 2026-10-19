import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, rentalAgreements, auditEvents, clients } from '@book-moto/db'

const bodySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  notes: z.string().trim().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const clientId = getRouterParam(event, 'id')
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Client id is required' })
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid agreement payload' })

  const startDate = new Date(parsed.data.startDate)
  const endDate = new Date(parsed.data.endDate)
  if (endDate <= startDate) throw createError({ statusCode: 400, statusMessage: 'End date must be after start date' })

  const db = await getDb()
  try {
    const agreement = await db.transaction(async (tx) => {
      const [client] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1)
      if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

      const [row] = await tx.insert(rentalAgreements).values({
        clientId,
        status: 'draft',
        startDate,
        endDate,
        notes: parsed.data.notes || null,
      }).returning()

      if (!row) throw createError({ statusCode: 500, statusMessage: 'Could not create agreement' })

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'rental.agreement_created',
        entityType: 'rental_agreement',
        entityId: row.id,
        metadata: { clientId, startDate: parsed.data.startDate, endDate: parsed.data.endDate },
      })

      return row
    })

    return { agreement }
  } catch (error) {
    throwApiError(error)
  }
})
