#!/usr/bin/env node
import {
  ensureFetchedBase,
  listChangedFiles,
  isBranchBehind,
  checkMigrationSafety,
  scanFeatureFlagGuards,
  checkTestsAlongsideSource,
  loadPrInfoFromEvent,
  fetchPrBody,
  checkPrBodySections,
  checkCiStatus,
  checkVerdictFile,
} from './gate-lib.mjs';

const BASE = process.env.BASE_BRANCH || 'main';
const BASE_REF = `origin/${BASE}`;

function printSummary(ok, reasons) {
  const title = ok ? 'SHIP' : 'BLOCK';
  console.log(`release-gate verdict: ${title}`);
  if (reasons.length > 0) {
    console.log('reasons:');
    for (const r of reasons) {
      console.log(`- ${r.kind}${r.file ? ` (${r.file})` : ''}${r.name ? ` [${r.name}]` : ''}`);
    }
  }
  // Machine-parsable JSON block
  console.log(JSON.stringify({ ok, reasons }, null, 2));
}

async function main() {
  ensureFetchedBase(BASE);
  const changed = listChangedFiles(BASE_REF);
  const reasons = [];

  if (isBranchBehind(BASE_REF)) {
    reasons.push({ kind: 'branch_behind_main' });
  }

  reasons.push(...checkMigrationSafety(changed));
  reasons.push(...scanFeatureFlagGuards(BASE_REF));
  reasons.push(...checkTestsAlongsideSource(changed));

  // PR body checks
  const event = loadPrInfoFromEvent();
  const repo = process.env.GITHUB_REPOSITORY || event?.repo;
  const sha = process.env.GITHUB_SHA || event?.headSHA || '';
  const token = process.env.GITHUB_TOKEN;
  let prBody = event?.body || '';
  const prNumberArg = process.argv.find((a) => a === '--pr') ? process.argv[process.argv.indexOf('--pr') + 1] : null;
  const prNumber = Number(prNumberArg || event?.number || 0);
  if ((!prBody || prBody.length < 10) && token && repo && prNumber) {
    try {
      prBody = await fetchPrBody({ prNumber, repo, token });
    } catch {
      // ignore
    }
  }
  reasons.push(...checkPrBodySections(prBody || ''));

  // CI checks (folds in Prisma gate)
  if (token && repo && sha) {
    reasons.push(...(await checkCiStatus({ sha, repo, token })));
  } else {
    reasons.push({ kind: 'ci_status_unchecked' });
  }

  // Verdict file (required to exist)
  reasons.push(...checkVerdictFile());

  const ok = reasons.length === 0;
  printSummary(ok, reasons);
  process.exit(ok ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

