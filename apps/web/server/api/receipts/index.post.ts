import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, receipts, allocations, obligations, auditEvents, idempotencyRecords } from '@book-moto/db'
import { createHash } from 'node:crypto'

const allocationSchema = z.object({
  obligationId: z.string().uuid(),
  amountMinor: z.number().int().min(1),
})

const bodySchema = z.object({
  clientId: z.string().uuid().optional(),
  amountMinor: z.number().int().min(1),
  currency: z.string().trim().length(3).default('VND'),
  method: z.string().trim().min(2).max(32).default('cash'),
  receivedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
  allocations: z.array(allocationSchema).default([]),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid receipt payload' })

  const db = await getDb()
  const idempotencyKey = getHeader(event, 'idempotency-key')
  const requestHash = idempotencyKey ? createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex') : null
  try {
    if (idempotencyKey && requestHash) {
      const [existing] = await db.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.scope, 'receipts'), eq(idempotencyRecords.idempotencyKey, idempotencyKey))).limit(1)
      if (existing) {
        if (existing.requestHash !== requestHash) throw createError({ statusCode: 409, statusMessage: 'Idempotency key reused with different payload' })
        return existing.response
      }
    }

    const totalAllocated = parsed.data.allocations.reduce((sum, item) => sum + item.amountMinor, 0)
    if (totalAllocated > parsed.data.amountMinor) throw createError({ statusCode: 409, statusMessage: 'Allocations exceed receipt amount' })

    const result = await db.transaction(async (tx) => {
      const receiptCurrency = parsed.data.currency
      if (parsed.data.allocations.length > 0) {
        const obligationIds = [...new Set(parsed.data.allocations.map(allocation => allocation.obligationId))]
        const obligationRows = await tx.select().from(obligations).where(inArray(obligations.id, obligationIds))
        const obligationById = new Map(obligationRows.map(row => [row.id, row]))
        const allocationRows = await tx.select().from(allocations).where(inArray(allocations.obligationId, obligationIds))
        const allocatedByObligation = new Map<string, number>()
        for (const allocation of allocationRows) {
          allocatedByObligation.set(allocation.obligationId, (allocatedByObligation.get(allocation.obligationId) ?? 0) + allocation.amountMinor)
        }

        const requestedByObligation = new Map<string, number>()
        for (const allocation of parsed.data.allocations) {
          requestedByObligation.set(allocation.obligationId, (requestedByObligation.get(allocation.obligationId) ?? 0) + allocation.amountMinor)
        }

        for (const [obligationId, requested] of requestedByObligation) {
          const obligation = obligationById.get(obligationId)
          if (!obligation) throw createError({ statusCode: 404, statusMessage: 'Obligation not found' })
          if (obligation.currency !== receiptCurrency) throw createError({ statusCode: 409, statusMessage: 'Obligation and receipt currencies do not match' })
          if (obligation.clientId && parsed.data.clientId && obligation.clientId !== parsed.data.clientId) {
            throw createError({ statusCode: 409, statusMessage: 'Obligation belongs to a different client' })
          }
          const remaining = obligation.amountMinor - (allocatedByObligation.get(obligationId) ?? 0)
          if (requested > remaining) throw createError({ statusCode: 409, statusMessage: 'Allocation exceeds the remaining obligation balance' })
        }
      }

      const [receipt] = await tx.insert(receipts).values({
        clientId: parsed.data.clientId || null,
        amountMinor: parsed.data.amountMinor,
        currency: parsed.data.currency,
        method: parsed.data.method,
        receivedAt: parsed.data.receivedAt ? new Date(parsed.data.receivedAt) : new Date(),
        notes: parsed.data.notes || null,
      }).returning()

      if (!receipt) throw createError({ statusCode: 500, statusMessage: 'Could not record receipt' })

      for (const allocation of parsed.data.allocations) {
        await tx.insert(allocations).values({
          receiptId: receipt.id,
          obligationId: allocation.obligationId,
          amountMinor: allocation.amountMinor,
        })
      }

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'finance.receipt_recorded',
        entityType: 'receipt',
        entityId: receipt.id,
        metadata: { amountMinor: receipt.amountMinor, allocatedMinor: totalAllocated },
      })

      if (idempotencyKey && requestHash) {
        await tx.insert(idempotencyRecords).values({
          scope: 'receipts',
          idempotencyKey,
          requestHash,
          response: { receipt },
        })
      }

      return receipt
    })

    return { receipt: result }
  } catch (error) {
    if (idempotencyKey && requestHash && (error as { code?: string } | null)?.code === '23505') {
      const [existing] = await db.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.scope, 'receipts'), eq(idempotencyRecords.idempotencyKey, idempotencyKey))).limit(1)
      if (existing) {
        if (existing.requestHash !== requestHash) throw createError({ statusCode: 409, statusMessage: 'Idempotency key reused with different payload' })
        return existing.response
      }
    }
    throwApiError(error)
  }
})
