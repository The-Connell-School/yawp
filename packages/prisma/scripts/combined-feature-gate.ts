import { readFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

export type CombinedFeatureGateScript =
  'combined-feature-preflight.sql' | 'combined-feature-postcheck.sql';

type QueryClient = {
  query: (sql: string) => Promise<unknown>;
};

type GateLogger = (message: string) => void;

const scriptsRoot = import.meta.dir;

export function stripPsqlMetaCommands(sql: string) {
  return sql.replace(
    /^\uFEFF?[ \t]*\\set[ \t]+ON_ERROR_STOP[ \t]+on[ \t]*(?:\r?\n|$)/u,
    ''
  );
}

export function loadCombinedFeatureGateSql(
  scriptName: CombinedFeatureGateScript
) {
  return stripPsqlMetaCommands(
    readFileSync(join(scriptsRoot, scriptName), 'utf8')
  );
}

export async function executeCombinedFeatureGate(
  client: QueryClient,
  scriptName: CombinedFeatureGateScript,
  log: GateLogger = console.log
) {
  const sql = loadCombinedFeatureGateSql(scriptName);
  log(`Running fail-closed migration gate: ${scriptName}`);
  await client.query(sql);
  log(`Migration gate passed: ${scriptName}`);
}

export async function runCombinedFeatureGate(
  scriptName: CombinedFeatureGateScript,
  env: NodeJS.ProcessEnv
) {
  if (!env.DATABASE_URL) {
    throw new Error(`Cannot run ${scriptName} without DATABASE_URL`);
  }

  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    options: env.PGOPTIONS,
    ssl:
      env.REMOTE_MIGRATE_TUNNEL === '1'
        ? { rejectUnauthorized: false }
        : undefined,
  });
  client.on('notice', (notice) =>
    console.log(`${scriptName}: ${notice.message}`)
  );
  await client.connect();
  try {
    await executeCombinedFeatureGate(client, scriptName);
  } finally {
    await client.end();
  }
}
