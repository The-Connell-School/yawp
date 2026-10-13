import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const defaultFailuresPath =
  '/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/FAILURES.md';
const defaultBacklogPath =
  '/home/bryant/work/yawp/codex-loop/lanes/free-tier-fixes/BACKLOG.md';

function readArg(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length).trim();
}

function optionalArg(name: string, fallback: string) {
  return readArg(name) || fallback;
}

function requiredArg(name: string) {
  const value = readArg(name);
  if (!value) {
    throw new Error(`Missing --${name}=...`);
  }
  return value;
}

export function buildFailureSection({
  slug,
  date,
  severity,
  env,
  repro,
  expected,
  actual,
  screenshots,
  filedToFixes,
}: {
  slug: string;
  date: string;
  severity: string;
  env: string;
  repro: string;
  expected: string;
  actual: string;
  screenshots: string;
  filedToFixes: string;
}) {
  return [
    '',
    `## ${date} — ${slug}`,
    `- severity: ${severity}`,
    `- env: ${env}`,
    `- repro: ${repro}`,
    `- expected: ${expected}`,
    `- actual: ${actual}`,
    `- screenshots: ${screenshots}`,
    `- filed_to_fixes: ${filedToFixes}`,
    '',
  ].join('\n');
}

async function prependBacklogItem(backlogPath: string, item: string) {
  const body = await readFile(backlogPath, 'utf8');
  const heading = 'P0b';
  const idx = body.indexOf(heading);
  if (idx === -1) {
    throw new Error(`Could not find ${heading} in ${backlogPath}`);
  }
  const lineStart = body.lastIndexOf('\n', idx);
  const insertAt = body.indexOf('\n', idx);
  if (insertAt === -1 || lineStart === -1) {
    throw new Error(`Could not locate ${heading} insertion point in ${backlogPath}`);
  }
  const updated = `${body.slice(0, insertAt + 1)}${item}\n${body.slice(insertAt + 1)}`;
  await writeFile(backlogPath, updated);
}

async function main() {
  const id = requiredArg('id');
  const slug = optionalArg('slug', id);
  const title = requiredArg('title');
  const evidence = requiredArg('evidence');
  const command = readArg('command') || 'bun run test:e2e:free-tier-demo';
  const date = optionalArg('date', new Date().toISOString().slice(0, 10));
  const severity = optionalArg('severity', 'major');
  const env = optionalArg('env', 'demo');
  const repro = optionalArg('repro', `Run \`${command}\`.`);
  const expected = optionalArg(
    'expected',
    'The free-tier demo E2E suite passes without regressions.'
  );
  const actual = optionalArg(
    'actual',
    'The free-tier demo E2E suite found a regression or blocker.'
  );
  const screenshots = optionalArg('screenshots', evidence);
  const failuresPath = process.env.FREE_TIER_QA_FAILURES_PATH || defaultFailuresPath;
  const backlogPath = process.env.FREE_TIER_FIXES_BACKLOG_PATH || defaultBacklogPath;
  const backlogItem = `- [ ] todo | **${id}** ${title}`;

  let filedToFixes = 'yes';
  try {
    await prependBacklogItem(backlogPath, backlogItem);
  } catch (error) {
    filedToFixes = `no - add ${backlogItem} under P0b`;
    console.error(
      `Could not update fixes backlog automatically. Add this under P0b: ${backlogItem}`
    );
    console.error(error);
  }

  await mkdir(path.dirname(failuresPath), { recursive: true });
  await appendFile(
    failuresPath,
    buildFailureSection({
      slug,
      date,
      severity,
      env,
      repro,
      expected,
      actual,
      screenshots,
      filedToFixes,
    })
  );
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
