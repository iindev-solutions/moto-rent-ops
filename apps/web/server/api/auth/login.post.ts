import { verify } from 'argon2'
import { createHash } from 'node:crypto'
import { eq, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, rateLimitBuckets, users } from '@book-moto/db'

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
  returnTo: z.string().optional(),
})

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 10

function rateLimitKey(email: string, ip: string): string {
  return createHash('sha256').update(`${email.toLowerCase()}|${ip}`).digest('hex')
}

async function checkRateLimit(key: string) {
  const db = await getDb()
  const now = new Date()
  const resetAt = new Date(now.getTime() + ATTEMPT_WINDOW_MS)
  const [row] = await db.insert(rateLimitBuckets).values({
    key,
    count: 1,
    resetAt,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: rateLimitBuckets.key,
    set: {
      count: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= now() THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
      resetAt: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= now() THEN now() + interval '10 minutes' ELSE ${rateLimitBuckets.resetAt} END`,
      updatedAt: sql`now()`,
    },
  }).returning()

  if (Number(row?.count ?? 0) > MAX_ATTEMPTS) {
    throw createError({ statusCode: 429, statusMessage: 'Too many login attempts. Try again later.' })
  }

  // Opportunistic cleanup keeps the durable bucket table bounded.
  try {
    await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.resetAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)))
  } catch {
    // Cleanup is not part of the authentication decision.
  }
}

async function clearRateLimit(key: string) {
  const db = await getDb()
  await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, key))
}

export default defineEventHandler(async (event) => {
  const parsed = loginSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid credentials payload' })
  }

  const email = parsed.data.email.toLowerCase()
  const trustProxy = process.env.NUXT_TRUST_PROXY === 'true'
  const clientKey = rateLimitKey(email, getRequestIP(event, { xForwardedFor: trustProxy }) || 'unknown')
  await checkRateLimit(clientKey)

  const db = await getDb()
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!user || !user.active || !await verify(user.passwordHash, parsed.data.password)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  await clearRateLimit(clientKey)

  await setUserSession(event, {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      locationScope: user.locationScope,
    },
  })

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    returnTo: safeBikeReturnTo(parsed.data.returnTo),
  }
})
