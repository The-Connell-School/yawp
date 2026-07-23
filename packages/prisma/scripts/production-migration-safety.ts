import pg from 'pg';

export const DEFAULT_MIGRATION_LOCK_TIMEOUT_MS = 5_000;
export const DEFAULT_MIGRATION_STATEMENT_TIMEOUT_MS = 600_000;
export const DEFAULT_BLOCKING_TRANSACTION_AGE_MS = 5_000;

type MigrationSafetyConfig = {
  lockTimeoutMs: number;
  statementTimeoutMs: number;
  blockingTransactionAgeMs: number;
};

type BlockingTransaction = {
  pid: number;
  application_name: string | null;
  state: string | null;
  transaction_age_ms: number;
  locked_relations: string[];
};

function readPositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  options: { allowZero?: boolean } = {}
) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  const minimum = options.allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(
      `${name} must be an integer greater than or equal to ${minimum}.`
    );
  }

  return value;
}

export function readMigrationSafetyConfig(
  env: NodeJS.ProcessEnv
): MigrationSafetyConfig {
  return {
    lockTimeoutMs: readPositiveInteger(
      env,
      'PROD_MIGRATION_LOCK_TIMEOUT_MS',
      DEFAULT_MIGRATION_LOCK_TIMEOUT_MS
    ),
    statementTimeoutMs: readPositiveInteger(
      env,
      'PROD_MIGRATION_STATEMENT_TIMEOUT_MS',
      DEFAULT_MIGRATION_STATEMENT_TIMEOUT_MS
    ),
    blockingTransactionAgeMs: readPositiveInteger(
      env,
      'PROD_MIGRATION_BLOCKING_TRANSACTION_AGE_MS',
      DEFAULT_BLOCKING_TRANSACTION_AGE_MS,
      { allowZero: true }
    ),
  };
}

export function withProductionMigrationTimeouts(
  env: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const config = readMigrationSafetyConfig(env);
  const enforcedOptions = [
    `-c lock_timeout=${config.lockTimeoutMs}ms`,
    `-c statement_timeout=${config.statementTimeoutMs}ms`,
  ].join(' ');

  return {
    ...env,
    PGOPTIONS: [env.PGOPTIONS, enforcedOptions].filter(Boolean).join(' '),
  };
}

export async function assertNoBlockingMigrationTransactions(
  env: NodeJS.ProcessEnv,
  log: (message: string) => void = console.log
) {
  if (!env.DATABASE_URL) {
    throw new Error(
      'Cannot run the migration lock preflight without DATABASE_URL.'
    );
  }

  const config = readMigrationSafetyConfig(env);
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl:
      env.REMOTE_MIGRATE_TUNNEL === '1'
        ? { rejectUnauthorized: false }
        : undefined,
    options: env.PGOPTIONS,
  });

  await client.connect();
  try {
    const result = await client.query<BlockingTransaction>(
      `
        SELECT
          activity.pid,
          NULLIF(activity.application_name, '') AS application_name,
          activity.state,
          floor(
            extract(epoch FROM (clock_timestamp() - activity.xact_start)) * 1000
          )::int AS transaction_age_ms,
          array_agg(
            DISTINCT quote_ident(namespace.nspname) || '.' || quote_ident(relation.relname)
            ORDER BY quote_ident(namespace.nspname) || '.' || quote_ident(relation.relname)
          ) AS locked_relations
        FROM pg_stat_activity AS activity
        JOIN pg_locks AS relation_lock
          ON relation_lock.pid = activity.pid
         AND relation_lock.locktype = 'relation'
         AND relation_lock.granted
        JOIN pg_class AS relation
          ON relation.oid = relation_lock.relation
        JOIN pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE activity.datname = current_database()
          AND activity.pid <> pg_backend_pid()
          AND activity.xact_start IS NOT NULL
          AND activity.state <> 'idle'
          AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
          AND clock_timestamp() - activity.xact_start
            >= $1::int * interval '1 millisecond'
        GROUP BY
          activity.pid,
          activity.application_name,
          activity.state,
          activity.xact_start
        ORDER BY activity.xact_start
      `,
      [config.blockingTransactionAgeMs]
    );

    if (result.rows.length > 0) {
      const summary = result.rows
        .map((row) => {
          const application = row.application_name ?? 'unknown application';
          return `pid ${row.pid} (${application}, ${row.transaction_age_ms}ms): ${row.locked_relations.join(', ')}`;
        })
        .join('; ');
      throw new Error(
        `Production migration preflight found transactions holding user-table locks: ${summary}`
      );
    }

    log(
      `Migration lock preflight passed (no user-table lock holder aged ${config.blockingTransactionAgeMs}ms or more).`
    );
  } finally {
    await client.end();
  }
}
