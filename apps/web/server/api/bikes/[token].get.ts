import { resolveBikeLocator } from '../../utils/bike-locator'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)

  const rawToken = getRouterParam(event, 'token')
  if (!rawToken) {
    throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  }

  try {
    const locator = await resolveBikeLocator(rawToken)
    if (!locator || !canAccessLocation(user, locator.location)) {
      throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
    }

    return {
      id: locator.motorcycleId,
      assetCode: locator.assetCode,
      model: locator.model,
      plate: locator.plate,
      photoUrl: locator.photoUrl,
      status: locator.status,
      location: locator.location,
      nextAction: locator.nextAction,
      manualCode: locator.manualCode,
      qrToken: safeDecryptLocatorToken(locator.tokenCiphertext),
    }
  } catch (error) {
    throwApiError(error)
  }
})
