import { verify } from 'argon2'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, users } from '@book-moto/db'
import { safeBikeReturnTo } from '../../../server/utils/auth'

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(256),
  returnTo: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const parsed = loginSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid credentials payload' })
  }

  const db = await getDb()
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase()))
    .limit(1)

  if (!user || !user.active || !await verify(user.passwordHash, parsed.data.password)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

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
