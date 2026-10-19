export default defineNitroPlugin(() => {
  const encoded = process.env.TOKEN_ENCRYPTION_KEY
  if (!encoded) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required — set it in .env before starting the server')
  }
  if (Buffer.from(encoded, 'base64').length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes — generate with: openssl rand -base64 32')
  }

  const sessionPassword = process.env.NUXT_SESSION_PASSWORD
  if (sessionPassword && sessionPassword.length < 32) {
    throw new Error('NUXT_SESSION_PASSWORD must be at least 32 characters long')
  }
})
