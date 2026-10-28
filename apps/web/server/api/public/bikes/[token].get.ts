import { defineEventHandler, getRouterParam, setResponseHeader } from 'h3'
import { createError } from 'h3'
import { resolveBikeLocator } from '../../../utils/bike-locator'

/**
 * Public bike lookup for QR scans by customers who are not staff.
 *
 * Deliberately minimal: model, plate, status and location only. No rentals,
 * clients, finance, audit data or manual codes. Unknown or revoked tokens
 * return 404 so token probing reveals nothing.
 */
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const rawToken = getRouterParam(event, 'token')
  if (!rawToken) {
    throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  }

  try {
    const locator = await resolveBikeLocator(rawToken)
    if (!locator) {
      throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
    }

    return {
      assetCode: locator.assetCode,
      model: locator.model,
      plate: locator.plate,
      photoUrl: locator.photoUrl,
      status: locator.status,
      location: locator.location,
    }
  } catch (error) {
    throwApiError(error)
  }
})
