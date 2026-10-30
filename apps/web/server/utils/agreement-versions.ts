import { eq, sql } from 'drizzle-orm'
import { rentalAgreements, rentalAgreementVersions, rentalItems, type DbTransaction } from '@book-moto/db'

export type AgreementChangeReason =
  | 'created'
  | 'item_added'
  | 'ready'
  | 'handover'
  | 'extended'
  | 'item_returned'
  | 'returned'
  | 'cancelled'
  | 'closed'

export function agreementVersionSnapshot(
  agreement: typeof rentalAgreements.$inferSelect,
  items: Array<typeof rentalItems.$inferSelect>,
) {
  return {
    agreement: {
      id: agreement.id,
      clientId: agreement.clientId,
      status: agreement.status,
      startDate: agreement.startDate ? agreement.startDate.toISOString() : null,
      endDate: agreement.endDate ? agreement.endDate.toISOString() : null,
      notes: agreement.notes,
    },
    items: items.map(item => ({
      id: item.id,
      motorcycleId: item.motorcycleId,
      startDate: item.startDate.toISOString(),
      endDate: item.endDate.toISOString(),
      dailyRateMinor: item.dailyRateMinor,
      currency: item.currency,
      status: item.status,
    })),
  }
}

/** Appends an immutable snapshot of the current agreement state without bumping the version. */
export async function appendAgreementVersion(
  tx: DbTransaction,
  agreement: typeof rentalAgreements.$inferSelect,
  changeReason: AgreementChangeReason,
  actorUserId: string | null,
) {
  const items = await tx.select().from(rentalItems).where(eq(rentalItems.agreementId, agreement.id))
  await tx.insert(rentalAgreementVersions).values({
    agreementId: agreement.id,
    version: agreement.version,
    status: agreement.status,
    changeReason,
    startDate: agreement.startDate,
    endDate: agreement.endDate,
    notes: agreement.notes,
    snapshot: agreementVersionSnapshot(agreement, items),
    createdByUserId: actorUserId,
  })
}

/** Applies agreement changes, bumps the version and appends the immutable snapshot atomically. */
export async function advanceAgreementVersion(
  tx: DbTransaction,
  agreementId: string,
  changes: Partial<Pick<typeof rentalAgreements.$inferInsert, 'status' | 'startDate' | 'endDate' | 'notes'>>,
  changeReason: AgreementChangeReason,
  actorUserId: string | null,
) {
  const [updated] = await tx
    .update(rentalAgreements)
    .set({ ...changes, version: sql`${rentalAgreements.version} + 1`, updatedAt: new Date() })
    .where(eq(rentalAgreements.id, agreementId))
    .returning()
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Agreement not found' })
  await appendAgreementVersion(tx, updated, changeReason, actorUserId)
  return updated
}
