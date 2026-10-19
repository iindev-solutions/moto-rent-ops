import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or } from 'drizzle-orm'
import type { TodayQueueEntry } from '@book-moto/contracts'
import { getDb, motorcycles, qrIdentities, qrPayloads, rentalItems, rentalAgreements, obligations, allocations, clients, deposits, incidents, maintenanceOrders } from '@book-moto/db'

const QUEUE_LIMIT = 25
const QUEUE_PAGE = 5

const entry = (values: Partial<TodayQueueEntry> & { id: string, href: string }): TodayQueueEntry => ({
  title: null,
  assetCode: null,
  model: null,
  type: null,
  priority: null,
  amountMinor: null,
  currency: null,
  clientName: null,
  date: null,
  ...values,
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const locationScope = user.locationScope ?? ['*']
  const unrestrictedLocation = user.role === 'owner' || user.role === 'admin' || locationScope.includes('*')
  const scopedBikeLocation = unrestrictedLocation ? undefined : and(isNotNull(motorcycles.location), inArray(motorcycles.location, locationScope))
  const scopedIncidentLocation = unrestrictedLocation ? undefined : or(isNull(motorcycles.location), inArray(motorcycles.location, locationScope))
  const db = await getDb()
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const in3Days = new Date(startOfToday.getTime() + 4 * 24 * 60 * 60 * 1000)
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const yesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000)

  const rows = await db.select({
    id: motorcycles.id,
    assetCode: motorcycles.assetCode,
    model: motorcycles.model,
    plate: motorcycles.plate,
    status: motorcycles.status,
    location: motorcycles.location,
    nextAction: motorcycles.nextAction,
    tokenCiphertext: qrPayloads.tokenCiphertext,
  }).from(motorcycles)
    .leftJoin(qrIdentities, eq(qrIdentities.motorcycleId, motorcycles.id))
    .leftJoin(qrPayloads, and(eq(qrPayloads.identityId, qrIdentities.id), eq(qrPayloads.status, 'active')))

  const visible = rows.filter(row => canAccessLocation(user, row.location))
  const recentBikes = visible.slice(0, QUEUE_PAGE).map(({ tokenCiphertext, ...bike }) => ({
    ...bike,
    qrToken: safeDecryptLocatorToken(tokenCiphertext),
  }))

  // Handovers due soon (only agreements that are ready or already active)
  const handoverRows = await db.select({
    id: rentalItems.id,
    agreementId: rentalItems.agreementId,
    startDate: rentalItems.startDate,
    assetCode: motorcycles.assetCode,
    model: motorcycles.model,
    location: motorcycles.location,
  }).from(rentalItems)
    .innerJoin(motorcycles, eq(motorcycles.id, rentalItems.motorcycleId))
    .innerJoin(rentalAgreements, eq(rentalAgreements.id, rentalItems.agreementId))
    .where(and(
      eq(rentalItems.status, 'planned'),
      inArray(rentalAgreements.status, ['ready', 'active']),
      gte(rentalItems.startDate, yesterday),
      lt(rentalItems.startDate, in3Days),
      scopedBikeLocation,
    ))
    .orderBy(asc(rentalItems.startDate))
    .limit(QUEUE_LIMIT)
  const handovers = handoverRows
    .slice(0, QUEUE_PAGE)
    .map(row => entry({
      id: row.id,
      assetCode: row.assetCode,
      model: row.model,
      date: row.startDate.toISOString(),
      href: `/agreements/${row.agreementId}`,
    }))

  // Returns due soon / overdue
  const returnRows = await db.select({
    id: rentalItems.id,
    agreementId: rentalItems.agreementId,
    endDate: rentalItems.endDate,
    assetCode: motorcycles.assetCode,
    model: motorcycles.model,
    location: motorcycles.location,
    clientName: clients.displayName,
  }).from(rentalItems)
    .innerJoin(motorcycles, eq(motorcycles.id, rentalItems.motorcycleId))
    .innerJoin(rentalAgreements, eq(rentalAgreements.id, rentalItems.agreementId))
    .leftJoin(clients, eq(clients.id, rentalAgreements.clientId))
    .where(and(
      eq(rentalItems.status, 'active'),
      lt(rentalItems.endDate, in3Days),
      scopedBikeLocation,
    ))
    .orderBy(asc(rentalItems.endDate))
    .limit(QUEUE_LIMIT)
  const returns = returnRows
    .slice(0, QUEUE_PAGE)
    .map(row => entry({
      id: row.id,
      assetCode: row.assetCode,
      model: row.model,
      clientName: row.clientName,
      date: row.endDate.toISOString(),
      href: `/return?item=${row.id}`,
    }))

  // Rentals out right now
  const activeRows = await db.select({
    id: rentalItems.id,
    endDate: rentalItems.endDate,
    assetCode: motorcycles.assetCode,
    model: motorcycles.model,
    location: motorcycles.location,
    clientName: clients.displayName,
  }).from(rentalItems)
    .innerJoin(motorcycles, eq(motorcycles.id, rentalItems.motorcycleId))
    .innerJoin(rentalAgreements, eq(rentalAgreements.id, rentalItems.agreementId))
    .leftJoin(clients, eq(clients.id, rentalAgreements.clientId))
    .where(and(
      eq(rentalItems.status, 'active'),
      scopedBikeLocation,
    ))
    .orderBy(asc(rentalItems.endDate))
    .limit(QUEUE_LIMIT)
  const activeRentals = activeRows
    .slice(0, QUEUE_PAGE)
    .map(row => entry({
      id: row.id,
      assetCode: row.assetCode,
      model: row.model,
      clientName: row.clientName,
      date: row.endDate.toISOString(),
      href: `/return?item=${row.id}`,
    }))

  // Overdue obligations that still have an outstanding balance
  const obligationRows = await db.select({
    id: obligations.id,
    type: obligations.type,
    amountMinor: obligations.amountMinor,
    currency: obligations.currency,
    dueDate: obligations.dueDate,
    clientName: clients.displayName,
  }).from(obligations)
    .leftJoin(clients, eq(clients.id, obligations.clientId))
    .where(and(
      lt(obligations.dueDate, now),
      isNotNull(obligations.dueDate),
    ))
    .orderBy(asc(obligations.dueDate))
    .limit(QUEUE_LIMIT)

  const overdueIds = obligationRows.map(row => row.id)
  const allocationSums = new Map<string, number>()
  if (overdueIds.length > 0) {
    const allocationRows = await db.select({
      obligationId: allocations.obligationId,
      amountMinor: allocations.amountMinor,
    }).from(allocations).where(inArray(allocations.obligationId, overdueIds))
    for (const allocation of allocationRows) {
      allocationSums.set(allocation.obligationId, (allocationSums.get(allocation.obligationId) ?? 0) + allocation.amountMinor)
    }
  }
  const overdueObligations = obligationRows
    .filter(row => (allocationSums.get(row.id) ?? 0) < row.amountMinor)
    .slice(0, QUEUE_PAGE)
    .map(row => entry({
      id: row.id,
      type: row.type,
      amountMinor: row.amountMinor,
      currency: row.currency,
      clientName: row.clientName,
      date: row.dueDate ? row.dueDate.toISOString() : null,
      href: `/finance`,
    }))

  // Maintenance due
  const maintenanceRows = await db.select({
    id: maintenanceOrders.id,
    type: maintenanceOrders.type,
    dueDate: maintenanceOrders.dueDate,
    assetCode: motorcycles.assetCode,
    model: motorcycles.model,
    location: motorcycles.location,
  }).from(maintenanceOrders)
    .innerJoin(motorcycles, eq(motorcycles.id, maintenanceOrders.motorcycleId))
    .where(and(
      inArray(maintenanceOrders.status, ['planned', 'due']),
      or(isNull(maintenanceOrders.dueDate), lte(maintenanceOrders.dueDate, in7Days)),
      scopedBikeLocation,
    ))
    .orderBy(asc(maintenanceOrders.dueDate))
    .limit(QUEUE_LIMIT)
  const maintenanceDue = maintenanceRows
    .slice(0, QUEUE_PAGE)
    .map(row => entry({
      id: row.id,
      type: row.type,
      assetCode: row.assetCode,
      model: row.model,
      date: row.dueDate ? row.dueDate.toISOString() : null,
      href: `/maintenance`,
    }))

  // Open incidents
  const incidentRows = await db.select({
    id: incidents.id,
    title: incidents.title,
    priority: incidents.priority,
    createdAt: incidents.createdAt,
    assetCode: motorcycles.assetCode,
    model: motorcycles.model,
    location: motorcycles.location,
  }).from(incidents)
    .leftJoin(motorcycles, eq(motorcycles.id, incidents.motorcycleId))
    .where(and(
      inArray(incidents.status, ['open', 'investigating']),
      scopedIncidentLocation,
    ))
    .orderBy(desc(incidents.createdAt))
    .limit(QUEUE_LIMIT)
  const openIncidents = incidentRows
    .slice(0, QUEUE_PAGE)
    .map(row => entry({
      id: row.id,
      title: row.title,
      assetCode: row.assetCode,
      model: row.model,
      priority: row.priority,
      date: row.createdAt.toISOString(),
      href: `/incidents`,
    }))

  // Deposits pending return
  const depositRows = await db.select({
    id: deposits.id,
    type: deposits.type,
    amountMinor: deposits.amountMinor,
    currency: deposits.currency,
    status: deposits.status,
    clientName: clients.displayName,
  }).from(deposits)
    .leftJoin(clients, eq(clients.id, deposits.clientId))
    .where(eq(deposits.status, 'held'))
    .orderBy(desc(deposits.receivedAt))
    .limit(QUEUE_PAGE)
  const depositsPending = depositRows.map(row => entry({
    id: row.id,
    type: row.type,
    amountMinor: row.amountMinor,
    currency: row.currency,
    clientName: row.clientName,
    href: `/finance`,
  }))

  return {
    stats: {
      total: visible.length,
      available: visible.filter(row => row.status === 'available').length,
      rented: visible.filter(row => row.status === 'rented').length,
      attention: visible.filter(row => ['maintenance', 'blocked', 'inspection'].includes(row.status)).length,
    },
    recentBikes,
    queues: {
      handovers,
      returns,
      activeRentals,
      overdueObligations,
      maintenanceDue,
      openIncidents,
      depositsPending,
    },
  }
})
