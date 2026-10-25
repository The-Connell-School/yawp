import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/demo-data-signature.sh');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

type HarnessOptions = {
  testerFeedbackTablePresent?: boolean;
  testerFeedbackCount?: number;
};

async function makeHarness(options: HarnessOptions = {}) {
  const testerFeedbackTablePresent = options.testerFeedbackTablePresent ?? true;
  const testerFeedbackCount = options.testerFeedbackCount ?? 5;
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-demo-signature-'));
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const commandLog = path.join(root, 'commands.log');
  const sqlLog = path.join(root, 'sql.log');
  await mkdir(bin);
  await writeFile(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'docker' >> "$COMMAND_LOG"
printf ' %q' "$@" >> "$COMMAND_LOG"
printf '\\n' >> "$COMMAND_LOG"
sql=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "-Atc" ]]; then
    sql="$2"
    break
  fi
  shift
done
printf '%s\\036' "$sql" >> "$SQL_LOG"
if [[ "$sql" == *'to_regclass($reg$public."TesterFeedback"$reg$)'* ]]; then
  printf '${testerFeedbackTablePresent ? '1' : '0'}\\n'
  exit 0
fi
if [[ "$sql" == *'FROM "TesterFeedback"'* ]]; then
  printf '${testerFeedbackCount}\\n'
  exit 0
fi
if [[ "$sql" == *json_build_object* ]]; then
  tf=0
  if [[ "$sql" =~ testerFeedback\\$json\\$,[[:space:]]*([0-9]+)::bigint ]]; then
    tf="\${BASH_REMATCH[1]}"
  fi
  printf '{"organizations":8,"users":18,"classes":15,"assignments":21,"documents":4,"submissions":3,"moduleSessions":2,"testerFeedback":%s}\\n' "$tf"
  exit 0
fi
printf 'unexpected sql\\n' >&2
exit 1
`
  );
  await chmod(path.join(bin, 'docker'), 0o755);
  return {
    commandLog,
    sqlLog,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      COMMAND_LOG: commandLog,
      SQL_LOG: sqlLog,
      DATABASE_NAME: 'yawp_demo',
      PREVIEW_POSTGRES_CONTAINER: 'preview-postgres',
    },
    testerFeedbackTablePresent,
    testerFeedbackCount,
  };
}

function run(env: Record<string, string | undefined>) {
  return Bun.spawnSync({
    cmd: ['bash', scriptPath],
    cwd: path.resolve('.'),
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

async function readLoggedSql(sqlLog: string) {
  return (await readFile(sqlLog, 'utf8')).split('\u001e').filter(Boolean);
}

describe('demo data signature', () => {
  test('reports aggregate counts including TesterFeedback when the table exists', async () => {
    const harness = await makeHarness();
    const result = run(harness.env);

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout).trim()).toBe(
      '{"organizations":8,"users":18,"classes":15,"assignments":21,"documents":4,"submissions":3,"moduleSessions":2,"testerFeedback":5}'
    );
    const sqlStatements = await readLoggedSql(harness.sqlLog);
    expect(sqlStatements).toHaveLength(3);
    for (const table of [
      'Organization',
      'User',
      'Class',
      'Assignment',
      'Document',
      'Submission',
      'AssignmentModuleSession',
    ]) {
      expect(sqlStatements[2]).toContain(table);
    }
    expect(sqlStatements[1]).toContain('FROM "TesterFeedback"');
    expect(sqlStatements[2]).not.toContain('FROM "TesterFeedback"');
    expect(sqlStatements.join('\n')).not.toContain('SELECT id');
  });

  test('emits testerFeedback 0 without querying the table when it is absent', async () => {
    const harness = await makeHarness({ testerFeedbackTablePresent: false });
    const result = run(harness.env);

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout).trim()).toBe(
      '{"organizations":8,"users":18,"classes":15,"assignments":21,"documents":4,"submissions":3,"moduleSessions":2,"testerFeedback":0}'
    );
    const sqlStatements = await readLoggedSql(harness.sqlLog);
    expect(sqlStatements).toHaveLength(2);
    expect(sqlStatements.join('\n')).not.toContain('FROM "TesterFeedback"');
    expect(sqlStatements[1]).toContain('$json$testerFeedback$json$, 0::bigint');
  });

  test('keeps to_regclass schema-qualified names inside bash single-quoted psql -Atc arguments', async () => {
    const harness = await makeHarness();
    const result = run(harness.env);

    expect(result.exitCode).toBe(0);
    const sqlStatements = await readLoggedSql(harness.sqlLog);
    const existenceSql = sqlStatements[0]!;
    expect(existenceSql).toContain('to_regclass($reg$public."TesterFeedback"$reg$)');
    expect(existenceSql).not.toMatch(/to_regclass\(public\./);
    expect(existenceSql).not.toMatch(/to_regclass\('public\./);
    expect(existenceSql).not.toContain('FROM "TesterFeedback"');
  });

  test('refuses any database except yawp_demo before Docker access', async () => {
    const harness = await makeHarness();
    const result = run({ ...harness.env, DATABASE_NAME: 'yawp_pr_241' });

    expect(result.exitCode).not.toBe(0);
    expect(await readFile(harness.commandLog, 'utf8').catch(() => '')).toBe('');
  });
});
