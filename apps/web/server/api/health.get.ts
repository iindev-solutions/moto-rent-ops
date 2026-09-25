export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)

  setResponseHeader(event, 'cache-control', 'no-store')

  return {
    status: 'ok',
    service: 'book-moto-web',
    databaseConfigured: Boolean(config.databaseUrl),
    timestamp: new Date().toISOString(),
  }
})
