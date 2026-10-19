import { randomUUID } from 'node:crypto'
import { and, count, eq } from 'drizzle-orm'
import { getDb, attachments, auditEvents } from '@book-moto/db'
import { getObjectStorage } from '../../utils/objects'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)

  const query = getQuery(event)
  const entityType = typeof query.entityType === 'string' ? query.entityType : ''
  const entityId = typeof query.entityId === 'string' ? query.entityId : ''
  if (!isAttachmentEntityType(entityType)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported attachment entity type' })
  }
  if (!/^[0-9a-f-]{36}$/i.test(entityId)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid attachment entity id' })
  }

  const contentType = (getHeader(event, 'content-type') || '').split(';')[0]?.trim().toLowerCase() || ''
  const extension = ATTACHMENT_CONTENT_TYPES[contentType]
  if (!extension) {
    throw createError({ statusCode: 400, statusMessage: 'Only JPEG, PNG or WebP images are supported' })
  }

  const body = await readRawBody(event, false)
  if (!body || body.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Empty upload body' })
  }
  if (body.length > ATTACHMENT_MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Attachment exceeds the 8 MB limit' })
  }

  const allowed = await canAccessAttachmentEntity(user, entityType, entityId)
  if (!allowed) {
    throw createError({ statusCode: 404, statusMessage: 'Attachment target not found' })
  }

  const db = await getDb()
  try {
    const [existing] = await db
      .select({ total: count() })
      .from(attachments)
      .where(and(eq(attachments.entityType, entityType), eq(attachments.entityId, entityId)))
    if (Number(existing?.total ?? 0) >= ATTACHMENT_LIMITS[entityType]) {
      throw createError({ statusCode: 409, statusMessage: 'Attachment limit reached for this record' })
    }

    const storageKey = `${entityType}/${entityId}/${randomUUID()}.${extension}`
    await getObjectStorage().put(storageKey, body, contentType)

    const [row] = await db.insert(attachments).values({
      entityType,
      entityId,
      storageKey,
      contentType,
      sizeBytes: body.length,
      createdByUserId: user.id,
    }).returning()

    await db.insert(auditEvents).values({
      actorUserId: user.id,
      action: 'attachment.created',
      entityType,
      entityId,
      metadata: { attachmentId: row?.id ?? null, contentType, sizeBytes: body.length },
    })

    return {
      attachment: row ? { id: row.id, contentType: row.contentType, sizeBytes: row.sizeBytes } : null,
    }
  } catch (error) {
    throwApiError(error)
  }
})
