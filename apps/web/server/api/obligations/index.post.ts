import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, obligations, auditEvents, clients, rentalAgreements, rentalItems } from '@book-moto/db'

const bodySchema = z.object({
  clientId: z.string().uuid().optional(),
  agreementId: z.string().uuid().optional(),
  rentalItemId: z.string().uuid().optional(),
  type: z.string().trim().min(2).max(32),
  amountMinor: z.number().int().min(0),
  currency: z.string().trim().length(3).default('VND'),
  dueDate: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid obligation payload' })

  const db = await getDb()
  try {
    const obligation = await db.transaction(async (tx) => {
      let agreementClientId: string | null = null
      let itemAgreementId: string | null = null

      if (parsed.data.clientId) {
        const [client] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, parsed.data.clientId)).limit(1)
        if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })
      }
      if (parsed.data.agreementId) {
        const [agreement] = await tx.select({ id: rentalAgreements.id, clientId: rentalAgreements.clientId }).from(rentalAgreements).where(eq(rentalAgreements.id, parsed.data.agreementId)).limit(1)
        if (!agreement) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })
        agreementClientId = agreement.clientId
      }
      if (parsed.data.rentalItemId) {
        const [item] = await tx.select({ id: rentalItems.id, agreementId: rentalItems.agreementId }).from(rentalItems).where(eq(rentalItems.id, parsed.data.rentalItemId)).limit(1)
        if (!item) throw createError({ statusCode: 404, statusMessage: 'Rental item not found' })
        itemAgreementId = item.agreementId
      }

      if (parsed.data.clientId && agreementClientId && agreementClientId !== parsed.data.clientId) {
        throw createError({ statusCode: 409, statusMessage: 'Agreement belongs to another client' })
      }
      if (parsed.data.agreementId && itemAgreementId && itemAgreementId !== parsed.data.agreementId) {
        throw createError({ statusCode: 409, statusMessage: 'Rental item belongs to another agreement' })
      }

      let resolvedAgreementId = parsed.data.agreementId || null
      if (!resolvedAgreementId && itemAgreementId) {
        resolvedAgreementId = itemAgreementId
      }

      let resolvedClientId = parsed.data.clientId || null
      if (!resolvedClientId && resolvedAgreementId) {
        const [agreement] = await tx.select({ clientId: rentalAgreements.clientId }).from(rentalAgreements).where(eq(rentalAgreements.id, resolvedAgreementId)).limit(1)
        resolvedClientId = agreement?.clientId ?? null
      }

      const [row] = await tx.insert(obligations).values({
        clientId: resolvedClientId,
        agreementId: resolvedAgreementId,
        rentalItemId: parsed.data.rentalItemId || null,
        type: parsed.data.type,
        amountMinor: parsed.data.amountMinor,
        currency: parsed.data.currency,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        notes: parsed.data.notes || null,
      }).returning()

      if (!row) throw createError({ statusCode: 500, statusMessage: 'Could not create obligation' })

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'finance.obligation_created',
        entityType: 'obligation',
        entityId: row.id,
        metadata: { type: row.type, amountMinor: row.amountMinor },
      })

      return row
    })

    return { obligation }
  } catch (error) {
    throwApiError(error)
  }
})
