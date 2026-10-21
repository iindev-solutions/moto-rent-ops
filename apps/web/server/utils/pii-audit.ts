import type { AppDatabase } from '@book-moto/db'
import { auditEvents } from '@book-moto/db'

export type PiiAuditSource = 'documents.list' | 'people.detail' | 'settlement'

type DisclosedDocument = { id: string, maskedNumber: string | null }

/**
 * Records disclosure of masked document requisites (one audit row per document).
 * Fail-closed: if the insert fails, the request fails before the data reaches the client,
 * so a response containing masked numbers is never unaudited.
 */
export async function auditMaskedRequisitesRead(
  db: AppDatabase,
  actorUserId: string,
  source: PiiAuditSource,
  documents: DisclosedDocument[],
) {
  const disclosed = documents.filter(document => Boolean(document.maskedNumber))
  if (disclosed.length === 0) return

  await db.insert(auditEvents).values(disclosed.map(document => ({
    actorUserId,
    action: 'document.masked_requisites_viewed',
    entityType: 'document_custody',
    entityId: document.id,
    metadata: { source },
  })))
}

/** Records that custody metadata (type/status) of a document was disclosed without its masked number. */
export async function auditCustodyRead(
  db: AppDatabase,
  actorUserId: string,
  source: PiiAuditSource,
  documentId: string,
) {
  await db.insert(auditEvents).values({
    actorUserId,
    action: 'document.custody_viewed',
    entityType: 'document_custody',
    entityId: documentId,
    metadata: { source },
  })
}
