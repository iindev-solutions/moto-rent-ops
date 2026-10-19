import { and, eq } from 'drizzle-orm'
import QRCode from 'qrcode'
import { getDb, motorcycles, qrIdentities, qrPayloads } from '@book-moto/db'
import { canonicalizeLocatorToken } from '@book-moto/domain/qr'
import { buildBikeDeepLink } from '@book-moto/domain/qr'
import { hashLocatorToken } from '@book-moto/db/crypto'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  const user = await requireAppUser(event)
  const rawToken = getRouterParam(event, 'token')
  const token = rawToken ? canonicalizeLocatorToken(rawToken) : null
  if (!token) {
    throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
  }

  const db = await getDb()
  const tokenHash = hashLocatorToken(token)

  try {
    const [row] = await db
      .select({ location: motorcycles.location })
      .from(qrPayloads)
      .innerJoin(qrIdentities, eq(qrPayloads.identityId, qrIdentities.id))
      .innerJoin(motorcycles, eq(qrIdentities.motorcycleId, motorcycles.id))
      .where(and(eq(qrPayloads.tokenHash, tokenHash), eq(qrPayloads.status, 'active')))
      .limit(1)

    if (!row || !canAccessLocation(user, row.location)) {
      throw createError({ statusCode: 404, statusMessage: 'Bike not found' })
    }

    const origin = getRequestURL(event).origin
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
