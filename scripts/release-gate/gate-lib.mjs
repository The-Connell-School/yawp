import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import https from 'node:https';

export function run(cmd, opts = {}) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts }).trim();
}

export function fetchJson({ hostname, path, headers }) {
  return new Promise((resolvePromise, reject) => {
    const req = https.request({ method: 'GET', hostname, path, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          resolvePromise({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export function ensureFetchedBase(baseBranch = 'main') {
  try {
    run(`git fetch --no-tags --depth=1 origin ${baseBranch}`);
  } catch {
    // ignore fetch issues; diff may still be available locally
  }
}

export function listChangedFiles(baseBranch = 'origin/main') {
  const out = run(`git diff --name-status ${baseBranch}...HEAD`);
  const lines = out ? out.split('\n') : [];
  return lines
    .map((l) => {
      const [status, ...rest] = l.split(/\s+/);
      const file = rest.pop();
      return { status, file };
    })
    .filter(Boolean);
}

export function isBranchBehind(baseBranch = 'origin/main') {
  const out = run(`git rev-list --left-right --count ${baseBranch}...HEAD`);
  const [behindStr] = out.split('\t');
  const behind = Number(behindStr);
  return behind > 0;
}

export function checkMigrationSafety(changedFiles, readFile = (p) => readFileSync(p, 'utf8')) {
  const migrationFiles = changedFiles
    .filter((f) => f.file.match(/migrations\/.+\.sql$/))
    .map((f) => f.file);
  const reasons = [];
  const destructive = [/^\s*drop\s+/i, /\balter\s+table\b.*\bdrop\b/i];
  const riskyUpdateTables = /\b(grade|grades|score|scores|rubric|rubrics|assignment|assignmenttype|submissiongradingassistantrun)\b/i;
  for (const file of migrationFiles) {
    const sql = readFile(resolve(file));
    if (destructive.some((r) => r.test(sql))) {
      reasons.push({ kind: 'migration_destructive_sql', file });
    }
    if (/\bupdate\b/i.test(sql) && riskyUpdateTables.test(sql)) {
      reasons.push({ kind: 'migration_updates_grades_scores_rubrics', file });
    }
  }
  return reasons;
}

const FEATURE_FLAG_TOKENS = [
  'writingPracticeEnabled',
  'reporterEnabled',
  'classInsightsEnabled',
  'revisionFlowEnabled',
  'submissionActivityEnabled',
];

export function scanFeatureFlagGuards(baseBranch = 'origin/main', opts = {}) {
  // Only examine added lines for feature tokens in server routes/actions.
  const diff =
    typeof opts.diffText === 'string'
      ? opts.diffText
      : run(`git diff -U0 ${baseBranch}...HEAD -- services/web-app/app/routes '**/*.server.*' '**/*route.*' || true`);
  const fileBlocks = diff.split('\n***').length > 1 ? diff : diff; // noop, ensure string
  const reasons = [];
  const fileAddPattern = /^diff --git a\/(.+?) b\/(.+)$/;
  let currentFile = null;
  const lines = diff.split('\n');
  for (const line of lines) {
    const m = line.match(fileAddPattern);
    if (m) {
      currentFile = m[2];
      continue;
    }
    if (!currentFile) continue;
    if (!currentFile.match(/services\/web-app\/app\/routes\//)) continue;
    if (!line.startsWith('+')) continue; // added only
    if (FEATURE_FLAG_TOKENS.some((tok) => line.includes(tok))) {
      // Check if same file includes an org flag guard reference
      // Heuristic: look for "organization.<flag>" or "membership.organization.<flag>"
      const fileContent =
        typeof opts.readFile === 'function' ? opts.readFile(currentFile) : readFileSync(currentFile, 'utf8');
      const guarded = FEATURE_FLAG_TOKENS.some((tok) =>
        new RegExp(`\\b(organization|membership\\.organization)\\.${tok}\\b`).test(fileContent)
      );
      if (!guarded) {
        reasons.push({ kind: 'missing_server_flag_guard', file: currentFile, flagHint: FEATURE_FLAG_TOKENS.find((t) => line.includes(t)) });
      }
    }
  }
  // De-duplicate by file
  const seen = new Set();
  return reasons.filter((r) => {
    const key = `${r.kind}:${r.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function checkTestsAlongsideSource(changedFiles) {
  const codeChanged = changedFiles.some((f) =>
    f.file.match(/\.(ts|tsx|js|jsx)$/) &&
    !f.file.match(/(\.(test|spec)\.(ts|tsx|js|jsx)|\/e2e\/|^docs\/|^\.github\/)/)
  );
  const testsChanged = changedFiles.some((f) =>
    f.file.match(/(\.(test|spec)\.(ts|tsx|js|jsx)|\/e2e\/)/)
  );
  return codeChanged && !testsChanged ? [{ kind: 'no_tests_changed' }] : [];
}

export function loadPrInfoFromEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(eventPath, 'utf8'));
    return {
      number: raw?.pull_request?.number,
      body: raw?.pull_request?.body ?? '',
      headSHA: raw?.pull_request?.head?.sha ?? process.env.GITHUB_SHA,
      repo: raw?.repository?.full_name ?? process.env.GITHUB_REPOSITORY,
    };
  } catch {
    return null;
  }
}

export async function fetchPrBody({ prNumber, repo, token }) {
  const [owner, name] = repo.split('/');
  const { statusCode, body } = await fetchJson({
    hostname: 'api.github.com',
    path: `/repos/${owner}/${name}/pulls/${prNumber}`,
    headers: {
      'User-Agent': 'yawp-release-gate',
      Accept: 'application/vnd.github+json',
      Authorization: token ? `Bearer ${token}` : undefined,
    },
  });
  if (statusCode !== 200) throw new Error(`GitHub PR fetch failed: ${statusCode}`);
  return body?.body ?? '';
}

export function checkPrBodySections(prBody) {
  const missing = [];
  if (!/^\s*Risks\s*:/im.test(prBody)) missing.push({ kind: 'pr_missing_risks_section' });
  if (!/^\s*Rollback\s*:/im.test(prBody)) missing.push({ kind: 'pr_missing_rollback_section' });
  return missing;
}

export async function checkCiStatus({ sha, repo, token }) {
  const [owner, name] = repo.split('/');
  const { statusCode, body } = await fetchJson({
    hostname: 'api.github.com',
    path: `/repos/${owner}/${name}/commits/${sha}/check-runs?per_page=100`,
    headers: {
      'User-Agent': 'yawp-release-gate',
      Accept: 'application/vnd.github+json',
      Authorization: token ? `Bearer ${token}` : undefined,
    },
  });
  if (statusCode !== 200) {
    return [{ kind: 'ci_status_unavailable', detail: String(statusCode) }];
  }
  const runs = body?.check_runs ?? [];
  const failures = runs.filter(
    (r) =>
      r.name !== 'release-gate' &&
      r.status === 'completed' &&
      ['failure', 'cancelled', 'timed_out', 'action_required'].includes(r.conclusion)
  );
  if (failures.length > 0) {
    return failures.map((r) => ({ kind: 'ci_check_failed', name: r.name }));
  }
  const pending = runs.filter(
    (r) =>
      r.name !== 'release-gate' && r.status !== 'completed'
  );
  if (pending.length > 0) {
    return [{ kind: 'ci_checks_pending', count: pending.length }];
  }
  // Ensure Prisma migrations job (folded-in DB integrity) is green if present
  const prisma = runs.find((r) => /Prisma migrations/i.test(r.name));
  if (prisma && !(prisma.status === 'completed' && prisma.conclusion === 'success')) {
    return [{ kind: 'ci_prisma_migrations_not_green' }];
  }
  return [];
}

export function checkVerdictFile({ prNumber, headSha, exists = existsSync, read = (p) => readFileSync(p, 'utf8') }) {
  if (!prNumber || !headSha) {
    return [{ kind: 'verdict_pr_or_sha_missing' }];
  }
  const path = resolve(`.release-gate/verdicts/pr-${prNumber}.json`);
  if (!exists(path)) {
    return [{ kind: 'verdict_file_missing_for_pr', prNumber }];
  }
  try {
    const v = JSON.parse(read(path));
    const blockers = Number(v?.blockers ?? 0);
    const majors = Number(v?.majors ?? 0);
    const verdictSha = String(v?.headSha || '');
    const reasons = [];
    if (!verdictSha || verdictSha !== headSha) {
      reasons.push({ kind: 'verdict_sha_mismatch', expected: headSha, observed: verdictSha });
    }
    if (blockers > 0) reasons.push({ kind: 'verdict_blockers_present', blockers });
    if (majors > 0) reasons.push({ kind: 'verdict_majors_present', majors });
    return reasons;
  } catch {
    return [{ kind: 'verdict_file_unreadable' }];
  }
}

export function parseFlagFromPrBody(prBody) {
  const m = prBody?.match(/^\s*Flag\s*:\s*([^\n]+)$/im);
  if (!m) return null;
  const raw = m[1].trim();
  if (/^none\b/i.test(raw)) return { kind: 'none', raw };
  const name = raw.split(/\s/)[0].trim();
  return { kind: 'named', name, raw };
}

export function checkFlagAgreement({ prBody, verdict }) {
  const reasons = [];
  const bodyFlag = parseFlagFromPrBody(prBody || '');
  const verdictFlag = verdict?.flag;
  if (bodyFlag?.kind === 'none') {
    if (String(verdictFlag || '').toLowerCase() !== 'none') {
      reasons.push({ kind: 'flag_agreement_mismatch', body: bodyFlag.raw, verdict: verdictFlag ?? '' });
    }
  }
  if (bodyFlag?.kind === 'named') {
    if (!verdictFlag || verdictFlag !== bodyFlag.name) {
      reasons.push({ kind: 'flag_agreement_mismatch', body: bodyFlag.raw, verdict: verdictFlag ?? '' });
    }
  }
  return { skipGuardScan: bodyFlag?.kind === 'none' && String(verdictFlag || '').toLowerCase() === 'none', reasons };
}

