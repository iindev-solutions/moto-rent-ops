import { z } from 'zod'
import { and, eq, gt, inArray, lt } from 'drizzle-orm'
import { getDb, clients, clientContacts, rentalAgreements, rentalItems, motorcycles, handovers, obligations, deposits, documentCustodies, auditEvents } from '@book-moto/db'

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_DEPOSIT_MINOR = 2_000_000
const DEFAULT_RATE_MINOR = 150_000

const bodySchema = z.object({
  clientId: z.string().uuid().optional(),
  newClient: z.object({
    displayName: z.string().trim().min(2).max(160),
    phone: z.string().trim().min(4).max(60).optional(),
  }).optional(),
  motorcycleId: z.string().uuid(),
  startDate: z.string().datetime().optional(),
  days: z.number().int().min(1).max(90),
  dailyRateMinor: z.number().int().min(0).default(DEFAULT_RATE_MINOR),
  currency: z.string().trim().length(3).default('VND'),
  depositType: z.enum(['cash', 'document_custody']).default('cash'),
  depositAmountMinor: z.number().int().min(0).optional(),
  passportMaskedNumber: z.string().trim().max(64).optional(),
}).refine(data => Boolean(data.clientId) !== Boolean(data.newClient), { message: 'Provide either clientId or newClient' })

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const parsed = bodySchema.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid quick rental payload' })

  const startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : new Date()
  if (Number.isNaN(startDate.getTime())) throw createError({ statusCode: 400, statusMessage: 'Invalid start date' })
  const endDate = new Date(startDate.getTime() + parsed.data.days * DAY_MS)
  const depositAmountMinor = parsed.data.depositType === 'cash'
    ? parsed.data.depositAmountMinor ?? DEFAULT_DEPOSIT_MINOR
    : null
  if (parsed.data.depositType === 'cash' && (depositAmountMinor ?? 0) <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Cash deposit amount must be positive' })
  }

  const db = await getDb()
  try {
    const result = await db.transaction(async (tx) => {
      let clientId = parsed.data.clientId ?? null
      if (clientId) {
        const [client] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1)
        if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found' })
      } else if (parsed.data.newClient) {
        const [client] = await tx.insert(clients).values({
          displayName: parsed.data.newClient.displayName,
          preferredChannel: 'phone',
        }).returning()
        if (!client) throw createError({ statusCode: 500, statusMessage: 'Could not create client' })
        if (parsed.data.newClient.phone) {
          await tx.insert(clientContacts).values({
            clientId: client.id,
            channel: 'phone',
            value: parsed.data.newClient.phone,
            isPrimary: true,
          })
        }
        clientId = client.id
      }
      if (!clientId) throw createError({ statusCode: 400, statusMessage: 'Client is required' })

      const [bike] = await tx.select().from(motorcycles).where(eq(motorcycles.id, parsed.data.motorcycleId)).limit(1).for('update')
      if (!bike || !canAccessLocation(user, bike.location)) throw createError({ statusCode: 404, statusMessage: 'Motorcycle not found' })
      if (bike.status !== 'available') throw createError({ statusCode: 409, statusMessage: 'Motorcycle is not available' })

      const overlapping = await tx.select({ id: rentalItems.id }).from(rentalItems).where(and(
        eq(rentalItems.motorcycleId, parsed.data.motorcycleId),
        inArray(rentalItems.status, ['planned', 'active']),
        lt(rentalItems.startDate, endDate),
        gt(rentalItems.endDate, startDate),
      )).limit(1)
      if (overlapping.length > 0) throw createError({ statusCode: 409, statusMessage: 'Motorcycle is already booked for overlapping dates' })

      const [agreement] = await tx.insert(rentalAgreements).values({
        clientId,
        status: 'active',
        startDate,
        endDate,
      }).returning()
      if (!agreement) throw createError({ statusCode: 500, statusMessage: 'Could not create agreement' })

      const [item] = await tx.insert(rentalItems).values({
        agreementId: agreement.id,
        motorcycleId: parsed.data.motorcycleId,
        startDate,
        endDate,
        dailyRateMinor: parsed.data.dailyRateMinor,
        currency: parsed.data.currency,
        status: 'active',
      }).returning()
      if (!item) throw createError({ statusCode: 500, statusMessage: 'Could not create rental item' })

      const [handover] = await tx.insert(handovers).values({
        rentalItemId: item.id,
        motorcycleId: parsed.data.motorcycleId,
        performedByUserId: user.id,
        checklist: {},
      }).returning()

      await tx.update(motorcycles).set({
        status: 'rented',
        nextAction: 'Return check',
        updatedAt: new Date(),
      }).where(eq(motorcycles.id, parsed.data.motorcycleId))

      const rentAmountMinor = parsed.data.dailyRateMinor * parsed.data.days
      await tx.insert(obligations).values({
        clientId,
        agreementId: agreement.id,
        rentalItemId: item.id,
        type: 'rent',
        status: 'planned',
        amountMinor: rentAmountMinor,
        currency: parsed.data.currency,
        dueDate: endDate,
        notes: 'Rent for rental period',
      })

      let documentCustodyId: string | null = null
      if (parsed.data.depositType === 'document_custody') {
        const [custody] = await tx.insert(documentCustodies).values({
          clientId,
          documentType: 'passport',
          maskedNumber: parsed.data.passportMaskedNumber || null,
          status: 'held',
          receivedByUserId: user.id,
        }).returning()
        documentCustodyId = custody?.id ?? null
      }

      const [deposit] = await tx.insert(deposits).values({
        clientId,
        agreementId: agreement.id,
        type: parsed.data.depositType,
        status: 'held',
        amountMinor: depositAmountMinor,
        currency: parsed.data.currency,
        documentCustodyId,
      }).returning()

      await tx.insert(auditEvents).values({
        actorUserId: user.id,
        action: 'rental.quick_created',
        entityType: 'rental_agreement',
        entityId: agreement.id,
        location: bike.location,
        metadata: {
          clientId,
          motorcycleId: parsed.data.motorcycleId,
          assetCode: bike.assetCode,
          days: parsed.data.days,
          depositType: parsed.data.depositType,
          depositAmountMinor,
        },
      })

      return {
        clientId,
        agreementId: agreement.id,
        itemId: item.id,
        handoverId: handover?.id ?? null,
        depositId: deposit?.id ?? null,
        documentCustodyId,
      }
    })

    return { rental: result }
  } catch (error) {
    throwApiError(error)
  }
})
