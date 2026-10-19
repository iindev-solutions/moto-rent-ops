import type { User } from '#auth-utils'
import { eq } from 'drizzle-orm'
import { getDb, documentCustodies, handovers, motorcycles, returnInspections } from '@book-moto/db'

export const ATTACHMENT_ENTITY_TYPES = ['return_inspection', 'document_custody', 'handover'] as const

export type AttachmentEntityType = typeof ATTACHMENT_ENTITY_TYPES[number]

export const ATTACHMENT_LIMITS: Record<AttachmentEntityType, number> = {
  return_inspection: 8,
  document_custody: 4,
  handover: 6,
}

export const ATTACHMENT_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024

export function isAttachmentEntityType(value: string): value is AttachmentEntityType {
  return (ATTACHMENT_ENTITY_TYPES as readonly string[]).includes(value)
}

export async function canAccessAttachmentEntity(user: User, entityType: AttachmentEntityType, entityId: string) {
  const db = await getDb()
  if (entityType === 'document_custody') {
    const [row] = await db.select({ id: documentCustodies.id }).from(documentCustodies).where(eq(documentCustodies.id, entityId)).limit(1)
    return Boolean(row)
  }

  if (entityType === 'return_inspection') {
    const [row] = await db
      .select({ location: motorcycles.location })
      .from(returnInspections)
      .innerJoin(motorcycles, eq(motorcycles.id, returnInspections.motorcycleId))
      .where(eq(returnInspections.id, entityId))
      .limit(1)
    return Boolean(row && canAccessLocation(user, row.location))
  }

  const [row] = await db
    .select({ location: motorcycles.location })
    .from(handovers)
    .innerJoin(motorcycles, eq(motorcycles.id, handovers.motorcycleId))
    .where(eq(handovers.id, entityId))
    .limit(1)
  return Boolean(row && canAccessLocation(user, row.location))
}
