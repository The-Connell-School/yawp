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

const waitlistCopyAliases = [
  'qa-event-waitlist',
  'qa-event-waitlist-copy-regression',
  'qa-regression-loop-review',
  'qa-suite-browser-cache-recovery',
  'qa-regression-loop-post-fixes',
  'qa-regression-suite-fresh-main',
  'qa-suite-contract-audit',
  'qa-waitlist-copy-post-fix-verify',
  'qa-suite-open-pr-clean-rerun',
  'qa-suite-open-pr-merge-readiness',
  'qa-waitlist-copy-fix-verify-rerun',
  'ft-event-waitlist-auto-admit',
  'ft-qa-waitlist-copy-fix-verify-rerun',
];

function normalizeKnownFailureText(value: string) {
  return value.toLowerCase().replace(/[^\w]+/g, '-');
}

function waitlistCopyKnownFailureKey(values: string[]) {
  const normalized = normalizeKnownFailureText(values.join('\n'));
  if (waitlistCopyAliases.some((alias) => normalized.includes(alias))) {
    return 'waitlist-copy';
  }
  if (
    normalized.includes('waitlist') &&
    (normalized.includes('join-link-copy') ||
      normalized.includes('join-link') ||
      normalized.includes('check-your-email-for-your-join-link'))
  ) {
    return 'waitlist-copy';
  }
  return null;
}

function hasExactFiling(body: string, { id, slug }: { id: string; slug: string }) {
  return body.includes(`— ${slug}`) || body.includes(`- ${slug}`) || body.includes(`**${id}**`);
}

function hasKnownWaitlistCopyFiling(body: string) {
  return waitlistCopyKnownFailureKey([body]) === 'waitlist-copy';
}

export function knownFailureSkipReason({
  failuresBody,
  backlogBody,
  id,
  slug,
  title,
  expected,
  actual,
}: {
  failuresBody: string;
  backlogBody: string;
  id: string;
  slug: string;
  title: string;
  expected: string;
  actual: string;
}) {
  if (hasExactFiling(failuresBody, { id, slug }) || hasExactFiling(backlogBody, { id, slug })) {
    return `exact filing already exists for ${slug}/${id}`;
  }

  const knownKey = waitlistCopyKnownFailureKey([id, slug, title, expected, actual]);
  if (
    knownKey === 'waitlist-copy' &&
    (hasKnownWaitlistCopyFiling(failuresBody) || hasKnownWaitlistCopyFiling(backlogBody))
  ) {
    return 'waitlist-copy known failure already filed';
  }

  return null;
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
  const headingLabel = '## P0b';
  const heading = /^##\s+P0b\s*$/m;
  const match = heading.exec(body);
  if (!match) {
    throw new Error(`Could not find ${headingLabel} in ${backlogPath}`);
  }
  const headingEnd = match.index + match[0].length;
  const insertAt = body.indexOf('\n', headingEnd);
  if (insertAt === -1) {
    await writeFile(backlogPath, `${body}\n${item}\n`);
    return;
  }
  const updated = `${body.slice(0, insertAt + 1)}${item}\n${body.slice(insertAt + 1)}`;
  await writeFile(backlogPath, updated);
}

async function readOptional(pathname: string) {
  try {
    return await readFile(pathname, 'utf8');
  } catch {
    return '';
  }
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
  const skipReason = knownFailureSkipReason({
    failuresBody: await readOptional(failuresPath),
    backlogBody: await readOptional(backlogPath),
    id,
    slug,
    title,
    expected,
    actual,
  });
  if (skipReason) {
    console.error(`Known failure already filed; skipping duplicate filing: ${skipReason}`);
    return;
  }

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
