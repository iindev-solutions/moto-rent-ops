import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { closeDb } from '@book-moto/db'
import {
  LegacyImportInputError,
  LegacyImportValidationError,
  runLegacyImport,
} from '../server/utils/legacy-import'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const file = argument('--file')
const apply = process.argv.includes('--apply')
const label = argument('--label')

if (!file) {
  console.error('Usage: npx tsx apps/web/scripts/import-legacy.ts --file <snapshot.json> [--apply] [--label <name>]')
  process.exitCode = 1
} else {
  try {
    const text = await readFile(file, 'utf8')
    const parsed = JSON.parse(text) as Record<string, unknown>
    const snapshot = parsed.snapshot ?? parsed
    const result = await runLegacyImport(snapshot, { apply, label })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (error instanceof LegacyImportInputError) {
      console.error(`Invalid snapshot: ${error.message}`)
    } else if (error instanceof LegacyImportValidationError) {
      console.error(`Import blocked by validation. Batch ${error.batchId}.`)
      console.error(JSON.stringify(error.report, null, 2))
    } else {
      console.error(error instanceof Error ? error.message : error)
    }
    process.exitCode = 1
  } finally {
    await closeDb()
  }
}
