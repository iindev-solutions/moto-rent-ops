type MaybeDatabaseError = { code?: string, cause?: unknown } | null | undefined

function extractDatabaseCode(error: unknown): string | undefined {
  let current: unknown = error
  for (let depth = 0; depth < 6 && current; depth += 1) {
    const candidate = current as MaybeDatabaseError
    if (typeof candidate?.code === 'string') {
      return candidate.code
    }
    current = candidate?.cause
  }
  return undefined
}

export function throwApiError(error: unknown, fallbackMessage = 'Database operation failed'): never {
  if (isError(error)) {
    throw error
  }

  const code = extractDatabaseCode(error)
  switch (code) {
    case '23505':
      throw createError({ statusCode: 409, statusMessage: 'Record already exists' })
    case '23503':
      throw createError({ statusCode: 409, statusMessage: 'Related record is missing' })
    case '23514':
      throw createError({ statusCode: 409, statusMessage: 'Value violates a database constraint' })
    case '22P02':
      throw createError({ statusCode: 400, statusMessage: 'Invalid identifier format' })
    default:
      console.error('[api] unhandled database error', error)
      throw createError({ statusCode: 503, statusMessage: fallbackMessage })
  }
}
