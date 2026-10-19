import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { getDb, deposits, auditEvents, clients, documentCustodies, rentalAgreements } from '@book-moto/db'

const bodySchema = z.object({
  clientId: z.string().uuid(),
  agreementId: z.string().uuid().optional(),
  type: z.enum(['cash', 'document_custody']).default('cash'),
  amountMinor: z.number().int().min(0).optional(),
  currency: z.string().trim().length(3).default('VND'),
  documentCustodyId: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid deposit payload' })
  if (parsed.data.type === 'cash' && (parsed.data.amountMinor ?? 0) <= 0) throw createError({ statusCode: 400, statusMessage: 'Cash deposit amount must be positive' })

  const db = await getDb()
  try {
    const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, parsed.data.clientId)).limit(1)
    if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })

    let documentCustodyId = parsed.data.documentCustodyId || null
    if (parsed.data.documentCustodyId) {
      const [custody] = await db.select({ id: documentCustodies.id, status: documentCustodies.status, clientId: documentCustodies.clientId }).from(documentCustodies).where(eq(documentCustodies.id, parsed.data.documentCustodyId)).limit(1)
      if (!custody) throw createError({ statusCode: 404, statusMessage: 'Document custody not found' })
      if (custody.status !== 'held') throw createError({ statusCode: 409, statusMessage: 'Document custody is not held' })
      if (custody.clientId !== parsed.data.clientId) throw createError({ statusCode: 409, statusMessage: 'Document custody belongs to another client' })
    } else if (parsed.data.type === 'document_custody') {
      const [custody] = await db.select({ id: documentCustodies.id }).from(documentCustodies).where(and(eq(documentCustodies.clientId, parsed.data.clientId), eq(documentCustodies.status, 'held'))).limit(1)
      if (!custody) throw createError({ statusCode: 409, statusMessage: 'No held document found for this client' })
      documentCustodyId = custody.id
    }

    if (parsed.data.agreementId) {
      const [agreement] = await db.select({ id: rentalAgreements.id, clientId: rentalAgreements.clientId }).from(rentalAgreements).where(eq(rentalAgreements.id, parsed.data.agreementId)).limit(1)
      if (!agreement) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })
      if (agreement.clientId !== parsed.data.clientId) throw createError({ statusCode: 409, statusMessage: 'Agreement belongs to another client' })
    }

    const [deposit] = await db.insert(deposits).values({
      clientId: parsed.data.clientId,
      agreementId: parsed.data.agreementId || null,
      type: parsed.data.type,
      status: 'held',
      amountMinor: parsed.data.amountMinor ?? null,
      currency: parsed.data.currency,
      documentCustodyId,
      notes: parsed.data.notes || null,
    }).returning()

    if (!deposit) throw createError({ statusCode: 500, statusMessage: 'Could not create deposit' })

    await db.insert(auditEvents).values({
      actorUserId: user.id,
      action: 'finance.deposit_received',
      entityType: 'deposit',
      entityId: deposit.id,
      metadata: { type: deposit.type, amountMinor: deposit.amountMinor },
    })

    return { deposit }
  } catch (error) {
    throwApiError(error)
  }
})
