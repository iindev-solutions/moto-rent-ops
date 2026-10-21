export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

export interface PaginationParams {
  limit: number
  offset: number
}

export function readPagination(
  event: Parameters<typeof getQuery>[0],
  defaultLimit = DEFAULT_PAGE_SIZE,
  maxLimit = MAX_PAGE_SIZE,
): PaginationParams {
  const query = getQuery(event)
  const limit = Number(query.limit)
  const offset = Number(query.offset)
  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), maxLimit) : defaultLimit,
    offset: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0,
  }
}

export function paginate<T>(rows: T[], params: PaginationParams) {
  const { limit, offset } = params
  return {
    items: rows.slice(offset, offset + limit),
    total: rows.length,
    limit,
    offset,
    hasMore: offset + limit < rows.length,
  }
}
