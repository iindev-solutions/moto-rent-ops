import { eq } from 'drizzle-orm'
import { getDb, attachments } from '@book-moto/db'
import { getObjectStorage } from '../../utils/objects'

export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Attachment id is required' })

  const db = await getDb()
  try {
    const [row] = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1)
    if (!row || !isAttachmentEntityType(row.entityType)) {
      throw createError({ statusCode: 404, statusMessage: 'Attachment not found' })
    }

    const allowed = await canAccessAttachmentEntity(user, row.entityType, row.entityId)
    if (!allowed) {
      throw createError({ statusCode: 404, statusMessage: 'Attachment not found' })
    }

    const data = await getObjectStorage().get(row.storageKey)
    setResponseHeader(event, 'content-type', row.contentType)
    setResponseHeader(event, 'cache-control', 'private, max-age=300')
    setResponseHeader(event, 'content-length', data.byteLength)
    return data
  } catch (error) {
    throwApiError(error)
  }
})
