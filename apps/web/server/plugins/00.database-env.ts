export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  const values = {
    DATABASE_PROVIDER: config.databaseProvider,
    DATABASE_URL: config.databaseUrl,
    PGLITE_DATA_DIR: config.pgliteDataDir,
    PGLITE_AUTO_MIGRATE: config.pgliteAutoMigrate,
  }

  for (const [key, value] of Object.entries(values)) {
    if (value && !process.env[key]) {
      process.env[key] = String(value)
    }
  }
})
