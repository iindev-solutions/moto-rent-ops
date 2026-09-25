import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { closeDb, migrateDatabase } from './client'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

await migrateDatabase()
await closeDb()
console.log('Database migrations applied')
