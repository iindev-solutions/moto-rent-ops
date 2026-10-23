import { z } from 'zod'
import { LegacyImportInputError, LegacyImportValidationError, runLegacyImport } from '../../../utils/legacy-import'

const bodySchema = z.object({
  snapshot: z.unknown(),
  apply: z.boolean().optional().default(false),
  label: z.string().trim().max(160).optional(),
})

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  requireOwnerOrAdmin(user)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid legacy import payload' })
  }

  try {
    return await runLegacyImport(parsed.data.snapshot, {
      apply: parsed.data.apply,
      label: parsed.data.label,
      createdByUserId: user.id,
    })
  } catch (error) {
    if (error instanceof LegacyImportInputError) {
      throw createError({ statusCode: 400, statusMessage: error.message })
    }
    if (error instanceof LegacyImportValidationError) {
      throw createError({
        statusCode: 422,
        statusMessage: error.message,
        data: { batchId: error.batchId, report: error.report },
      })
    }
    throw error
  }
})
