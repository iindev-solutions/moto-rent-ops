import QRCode from 'qrcode'
import { buildBikeDeepLink } from '@book-moto/domain/qr'
import { resolveBikeLocator } from '../../../utils/bike-locator'

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

    const token = safeDecryptLocatorToken(locator.tokenCiphertext)
    if (!token) {
      throw createError({ statusCode: 500, statusMessage: 'Stored locator token is unreadable' })
    }

    const origin = useRuntimeConfig().public.secureAppUrl || getRequestURL(event).origin
    const deepLink = buildBikeDeepLink(origin, token)
    const svg = await QRCode.toString(deepLink, {
      type: 'svg',
      margin: 1,
      width: 256,
      color: { dark: '#11110f', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })

    setResponseHeader(event, 'content-type', 'image/svg+xml; charset=utf-8')
    return svg
  } catch (error) {
    throwApiError(error)
  }
})
