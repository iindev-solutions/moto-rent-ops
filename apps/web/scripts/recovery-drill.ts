import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const [
  { closeDb },
  { createRecoveryBackup, restoreRecoveryBackup, runRecoveryDrill, verifyRecoveryBackup },
  { buildRecoveryReport, safeFailureCode },
] = await Promise.all([
  import('@book-moto/db'),
  import('../server/utils/recovery-drill'),
  import('../server/utils/recovery-report'),
])

type Command = 'backup' | 'restore' | 'drill' | 'verify'

const COMMANDS: Command[] = ['backup', 'restore', 'drill', 'verify']

function usage() {
  console.error(`Usage:
  npm run recovery:backup  -- --target <dir> [--json]
  npm run recovery:restore -- --artifact <dir> --target-env isolated [--json]
  npm run recovery:drill   -- --target <dir> --operator-email <email> [--json]
  npm run recovery:verify  -- --artifact <dir> --target-env isolated [--json]

Optional:
  --root <dir>                 Recovery root (default RECOVERY_ROOT or .data/recovery)
  --target-pglite-dir <dir>    Isolated PGlite target directory
  --target-database-url <url>  Isolated PostgreSQL target
  --target-storage-root <dir>  Isolated local document storage root
  --source-storage-root <dir>  Source local document storage root`)
}

function parseFlags(args: string[]) {
  const flags = new Map<string, string | true>()
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!
    if (!arg.startsWith('--')) continue
    const [rawKey, inline] = arg.slice(2).split('=', 2)
    if (!rawKey) continue
    if (inline !== undefined) {
      flags.set(rawKey, inline)
      continue
    }
    const next = args[index + 1]
    if (next && !next.startsWith('--')) {
      flags.set(rawKey, next)
      index += 1
    } else {
      flags.set(rawKey, true)
    }
  }
  return flags
}

function value(flags: Map<string, string | true>, key: string): string | undefined {
  const found = flags.get(key)
  return typeof found === 'string' ? found : undefined
}

function required(flags: Map<string, string | true>, key: string) {
  const found = value(flags, key)
  if (!found) throw new Error(`--${key} is required`)
  return found
}

function exitCodeForFailure(failureCode: string) {
  if (failureCode === 'isolation_refused') return 3
  if ([
    'configuration_error',
    'artifact_exists',
    'artifact_invalid',
    'operator_not_found',
    'operator_not_authorized',
    'target_not_empty',
  ].includes(failureCode)) {
    return 2
  }
  return 4
}

function printReport(report: ReturnType<typeof buildRecoveryReport>, json: boolean) {
  if (json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  const failed = report.scopes.filter(scope => scope.status === 'failed').length
  console.log(`Recovery ${report.command}: ${report.status}`)
  console.log(`artifact: ${report.artifactRef}`)
  if (report.manifestChecksum) console.log(`manifest: ${report.manifestChecksum}`)
  console.log(`scopes: ${report.scopes.length} total, ${failed} failed`)
  if (report.failureCode) console.log(`failure: ${report.failureCode}`)
}

async function main() {
  const [rawCommand] = process.argv.slice(2)
  if (!rawCommand || !COMMANDS.includes(rawCommand as Command)) {
    usage()
    process.exitCode = 2
    return
  }
  const command = rawCommand as Command
  const flags = parseFlags(process.argv.slice(3))
  const json = flags.has('json')

  try {
    if (command === 'backup') {
      const backup = await createRecoveryBackup({
        targetDir: required(flags, 'target'),
        recoveryRoot: value(flags, 'root'),
        sourceStorageRoot: value(flags, 'source-storage-root'),
      })
      printReport(buildRecoveryReport({
        command: 'backup',
        status: 'passed',
        artifactRef: backup.artifactRef,
        manifestChecksum: backup.manifestChecksum,
        startedAt: backup.startedAt.toISOString(),
        finishedAt: backup.finishedAt.toISOString(),
        scopes: backup.manifest.scopes.map(scope => ({
          scope: scope.name,
          expectedCount: scope.count,
          actualCount: scope.count,
          expectedTotalMinor: scope.totalMinor,
          actualTotalMinor: scope.totalMinor,
          currency: scope.currency,
          status: 'passed' as const,
          mismatchCode: null,
        })),
        failureCode: null,
      }), json)
      process.exitCode = 0
      return
    }

    if (command === 'drill') {
      const result = await runRecoveryDrill({
        targetDir: required(flags, 'target'),
        operatorEmail: value(flags, 'operator-email') ?? process.env.SEED_ADMIN_EMAIL ?? '',
        recoveryRoot: value(flags, 'root'),
        targetEnvironment: value(flags, 'target-env'),
        targetPgliteDir: value(flags, 'target-pglite-dir'),
        targetDatabaseUrl: value(flags, 'target-database-url'),
        targetStorageRoot: value(flags, 'target-storage-root'),
        sourceStorageRoot: value(flags, 'source-storage-root'),
      })
      printReport(buildRecoveryReport({
        command: 'drill',
        status: result.status,
        drillId: result.drillId,
        artifactRef: result.artifactRef,
        manifestChecksum: result.manifestChecksum,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        scopes: result.scopes,
        failureCode: result.failureCode,
      }), json)
      process.exitCode = result.status === 'passed' ? 0 : 1
      return
    }

    const restored = command === 'restore'
      ? await restoreRecoveryBackup({
          artifactDir: required(flags, 'artifact'),
          recoveryRoot: value(flags, 'root'),
          targetEnvironment: value(flags, 'target-env'),
          targetPgliteDir: value(flags, 'target-pglite-dir'),
          targetDatabaseUrl: value(flags, 'target-database-url'),
          targetStorageRoot: value(flags, 'target-storage-root'),
        })
      : await verifyRecoveryBackup({
          artifactDir: required(flags, 'artifact'),
          recoveryRoot: value(flags, 'root'),
          targetEnvironment: value(flags, 'target-env'),
          targetPgliteDir: value(flags, 'target-pglite-dir'),
          targetDatabaseUrl: value(flags, 'target-database-url'),
          targetStorageRoot: value(flags, 'target-storage-root'),
        })
    printReport(buildRecoveryReport({
      command,
      status: restored.verification.status,
      artifactRef: restored.artifactRef,
      manifestChecksum: restored.manifestChecksum,
      startedAt: restored.startedAt.toISOString(),
      finishedAt: restored.finishedAt.toISOString(),
      scopes: restored.verification.scopes,
      failureCode: restored.verification.failureCode,
    }), json)
    process.exitCode = restored.verification.status === 'passed' ? 0 : 1
  } catch (error) {
    const failureCode = safeFailureCode(error)
    if (json) {
      console.log(JSON.stringify({ command, status: 'failed', failureCode }, null, 2))
    }
    console.error(`Recovery ${command} failed: ${failureCode}`)
    process.exitCode = exitCodeForFailure(failureCode)
  } finally {
    await closeDb()
  }
}

await main()
