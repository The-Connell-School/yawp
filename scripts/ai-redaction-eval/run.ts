#!/usr/bin/env bun
/**
 * Paired A/B live-API eval: does enabling PII redaction on the grading
 * prompt regress response quality vs. the current production behavior
 * (no redaction)?
 *
 * For every essay in ./corpus.ts, runs the real grading flow twice against
 * the live Anthropic API on identical input (same essay, same rubric, same
 * model) — once as CONTROL (redaction disabled: the student's real first
 * name goes straight into the prompt, exactly like prod today) and once as
 * TREATMENT (redaction enabled: the student's first name is redacted to a
 * pseudonym via the real `buildRedactionMapping`/`redact` before the
 * prompt is built, then the real `rehydrate` restores the real name in the
 * response afterward — exactly like this branch).
 *
 * Usage (from repo root):
 *   bun --env-file=services/web-app/.env run scripts/ai-redaction-eval/run.ts
 *
 * Requires ANTHROPIC_API_KEY in services/web-app/.env (or already exported
 * in your shell) — see scripts/worktree-local-setup.sh for how that file
 * gets a real key copied into a fresh worktree. `--env-file` is required
 * (not optional) because the Anthropic SDK client is constructed at
 * import time by app/services/anthropic.ts, before this script's own code
 * runs — ES module imports are hoisted above any in-file env loading, so
 * env vars MUST be set by the process environment before Bun starts, not
 * by code inside this file. Optionally cap the corpus with EVAL_LIMIT=N
 * for a smoke test, e.g. EVAL_LIMIT=1.
 *
 * Writes:
 *   scripts/ai-redaction-eval/results/results-<timestamp>.json  (raw evidence)
 *   scripts/ai-redaction-eval/results/latest.json               (copy of the above)
 *   scripts/ai-redaction-eval/report.md                         (human-readable verdict)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error(
    '\nWALL: ANTHROPIC_API_KEY is not set in the process environment.\n' +
      'This eval requires the real Anthropic API — mocks are worthless for a quality regression check.\n' +
      'Run with: bun --env-file=services/web-app/.env run scripts/ai-redaction-eval/run.ts\n' +
      '(or export ANTHROPIC_API_KEY yourself before running).\n'
  );
  process.exit(1);
}

import { firstNameFromFullName } from '../../services/web-app/app/domain/grading/personalize';
import { rubricCategories, DEFAULT_MAX_SCORE } from './rubric';
import { buildRedactionMapping, redact, rehydrate } from './redaction';
import { corpus, type CorpusCase } from './corpus';
import { runGrading, AI_MODEL, type GradingRunResult } from './llm';
import { judgePair, type JudgeVerdict } from './judge';
import { containsWholeWordName, scanTextsForName } from './leak-scan';
import { isCommonWordFirstName } from '../../services/web-app/app/utils/ai-redaction/common-word-names.server';
import {
  computeCategoryDeltas,
  summarizeDistribution,
  weightedPercent,
  type CategoryDelta,
} from './scoring';

const RESULTS_DIR = join(__dirname, 'results');
mkdirSync(RESULTS_DIR, { recursive: true });

const RUBRIC_WEIGHTS = rubricCategories.map((c) => ({
  key: c.key,
  weight: c.weight,
  maxScore: DEFAULT_MAX_SCORE,
}));

interface CaseResult {
  id: string;
  band: CorpusCase['band'];
  note: string;
  studentFullName: string;
  studentFirstName: string;
  pseudonymFirstName: string;
  control: {
    categories: { key: string; score: number; comment: string }[];
    overallComment: string;
    totalPercent: number;
    neededRepair: boolean;
    neededOverallCommentFollowup: boolean;
  };
  treatment: {
    categories: { key: string; score: number; comment: string }[];
    overallComment: string;
    totalPercent: number;
    neededRepair: boolean;
    neededOverallCommentFollowup: boolean;
  };
  categoryDeltas: CategoryDelta[];
  totalDelta: number;
  leaks: {
    realNameInTreatmentOutboundPrompt: { found: boolean; matches: string[] };
    realNameInTreatmentRawResponse: boolean;
    pseudonymStrayInTreatmentFinalOutput: { found: boolean; matches: string[] };
  };
  nameCorrectness: {
    controlOverallCommentHasRealName: boolean;
    treatmentOverallCommentHasRealName: boolean;
    pass: boolean;
  };
  judge: JudgeVerdict;
  error?: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`  retrying after error in ${label}: ${(err as Error).message}`);
    await sleep(3000);
    return await fn();
  }
}

async function runCase(testCase: CorpusCase, index: number, total: number): Promise<CaseResult> {
  console.log(`[${index + 1}/${total}] ${testCase.id} (${testCase.studentFullName})`);

  const studentFirstName = firstNameFromFullName(testCase.studentFullName);
  const mapping = buildRedactionMapping([studentFirstName]);
  const pseudonymFirstName = redact(studentFirstName, mapping);

  // CONTROL: current prod behavior -- real name straight into the prompt,
  // no redact()/rehydrate() call at all.
  const controlRun: GradingRunResult = await withRetry(
    () =>
      runGrading({
        firstNameForPrompt: studentFirstName,
        essayText: testCase.essayText,
      }),
    `${testCase.id} control`
  );

  // TREATMENT: this branch's behavior -- pseudonym in the prompt AND the
  // essay body redacted in prose mode (students sign their work and write
  // about themselves by name), then rehydrate() the response back to the
  // real name before use.
  const redactedEssayText = redact(testCase.essayText, mapping, {
    mode: 'prose',
  });
  const treatmentRun: GradingRunResult = await withRetry(
    () =>
      runGrading({
        firstNameForPrompt: pseudonymFirstName,
        essayText: redactedEssayText,
      }),
    `${testCase.id} treatment`
  );

  const treatmentCategoriesRehydrated = treatmentRun.categories.map((c) => ({
    key: c.key,
    score: c.score,
    comment: rehydrate(c.comment, mapping),
  }));
  const treatmentOverallCommentRehydrated = rehydrate(
    treatmentRun.overallComment,
    mapping
  );

  const controlTotalPercent = weightedPercent(
    controlRun.categories,
    RUBRIC_WEIGHTS
  );
  const treatmentTotalPercent = weightedPercent(
    treatmentCategoriesRehydrated,
    RUBRIC_WEIGHTS
  );

  const categoryDeltas = computeCategoryDeltas(
    controlRun.categories,
    treatmentCategoriesRehydrated
  );

  // --- Leak scans -----------------------------------------------------
  // A name that is also an ordinary English word is scanned capitalized-only,
  // because prose redaction deliberately leaves the lowercase common word
  // alone. This narrowing is reported per-case so it can't pass silently.
  const commonWordName = isCommonWordFirstName(studentFirstName);
  const leakScanOptions = { capitalizedOnly: commonWordName };
  const realNameInTreatmentOutboundPrompt = scanTextsForName(
    {
      system: treatmentRun.outboundSystem,
      userPrompt: treatmentRun.outboundUserPrompt,
    },
    studentFirstName,
    leakScanOptions
  );
  const realNameInTreatmentRawResponse = containsWholeWordName(
    treatmentRun.rawResponseText,
    studentFirstName,
    leakScanOptions
  );
  const pseudonymStrayInTreatmentFinalOutput = scanTextsForName(
    {
      overallComment: treatmentOverallCommentRehydrated,
      categoryComments: treatmentCategoriesRehydrated
        .map((c) => c.comment)
        .join('\n'),
    },
    pseudonymFirstName
  );

  // --- Name correctness -------------------------------------------------
  const controlOverallCommentHasRealName = containsWholeWordName(
    controlRun.overallComment,
    studentFirstName
  );
  const treatmentOverallCommentHasRealName = containsWholeWordName(
    treatmentOverallCommentRehydrated,
    studentFirstName
  );
  const nameCorrectnessPass =
    controlOverallCommentHasRealName &&
    treatmentOverallCommentHasRealName &&
    !realNameInTreatmentOutboundPrompt.found &&
    !realNameInTreatmentRawResponse &&
    !pseudonymStrayInTreatmentFinalOutput.found;

  // --- Blind pairwise judge --------------------------------------------
  const judge = await withRetry(
    () =>
      judgePair({
        essayText: testCase.essayText,
        controlComment: controlRun.overallComment,
        treatmentComment: treatmentOverallCommentRehydrated,
      }),
    `${testCase.id} judge`
  );

  return {
    id: testCase.id,
    band: testCase.band,
    note: testCase.note,
    studentFullName: testCase.studentFullName,
    studentFirstName,
    pseudonymFirstName,
    commonWordName,
    control: {
      categories: controlRun.categories,
      overallComment: controlRun.overallComment,
      totalPercent: controlTotalPercent,
      neededRepair: controlRun.neededRepair,
      neededOverallCommentFollowup: controlRun.neededOverallCommentFollowup,
    },
    treatment: {
      categories: treatmentCategoriesRehydrated,
      overallComment: treatmentOverallCommentRehydrated,
      totalPercent: treatmentTotalPercent,
      neededRepair: treatmentRun.neededRepair,
      neededOverallCommentFollowup: treatmentRun.neededOverallCommentFollowup,
    },
    categoryDeltas,
    totalDelta: Math.round((treatmentTotalPercent - controlTotalPercent) * 100) / 100,
    leaks: {
      leakScanNarrowedToCapitalized: commonWordName,
      realNameInTreatmentOutboundPrompt,
      realNameInTreatmentRawResponse,
      pseudonymStrayInTreatmentFinalOutput,
    },
    nameCorrectness: {
      controlOverallCommentHasRealName,
      treatmentOverallCommentHasRealName,
      pass: nameCorrectnessPass,
    },
    judge,
  };
}

function buildReport(results: CaseResult[], errors: { id: string; error: string }[]): string {
  const totalDeltas = results.map((r) => r.totalDelta);
  const dist = summarizeDistribution(totalDeltas);
  const nameCorrectPassCount = results.filter((r) => r.nameCorrectness.pass).length;
  const leakFailures = results.filter(
    (r) =>
      r.leaks.realNameInTreatmentOutboundPrompt.found ||
      r.leaks.realNameInTreatmentRawResponse ||
      r.leaks.pseudonymStrayInTreatmentFinalOutput.found
  );
  const judgeWins = {
    control: results.filter((r) => r.judge.winner === 'control').length,
    treatment: results.filter((r) => r.judge.winner === 'treatment').length,
    tie: results.filter((r) => r.judge.winner === 'tie').length,
  };
  const bigSwings = results.filter((r) => Math.abs(r.totalDelta) >= 10);
  const sharedNamePair = results.filter((r) =>
    ['E05-mid-shared-name-maya-thompson', 'E06-strong-shared-name-maya-obrien'].includes(r.id)
  );
  const sharedPseudonyms = new Set(sharedNamePair.map((r) => r.pseudonymFirstName));

  let verdict: string;
  if (leakFailures.length > 0) {
    verdict = 'FAIL — PII leak detected. See "Leak failures" below before drawing any quality conclusion.';
  } else if (nameCorrectPassCount < results.length) {
    verdict = 'FAIL — name-correctness failure(s) present (see below), independent of score/tone quality.';
  } else if (Math.abs(dist.mean) < 3 && dist.stdev < 8 && bigSwings.length === 0) {
    verdict = 'DID NOT REGRESS — score deltas are small and centered near zero, no individual swings ≥10 points, and no PII leaks or name-correctness failures.';
  } else if (bigSwings.length > 0) {
    verdict = `AMBIGUOUS — mean delta is small but ${bigSwings.length} case(s) show a ≥10-point swing; investigate those cases individually before shipping (see "Individual anomalies").`;
  } else {
    verdict = 'AMBIGUOUS — deltas are noisier than expected; see distribution and per-case table before concluding either way.';
  }

  const lines: string[] = [];
  lines.push('# AI PII Redaction — Quality Regression Eval Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Model: ${AI_MODEL}`);
  lines.push(`Paired cases executed: ${results.length}${errors.length ? ` (${errors.length} case(s) failed to complete — see "Execution failures")` : ''}`);
  lines.push('');
  lines.push('## Aggregate verdict');
  lines.push('');
  lines.push(`**${verdict}**`);
  lines.push('');
  lines.push('## What was measured');
  lines.push('');
  lines.push('For each essay, the real grading prompt/response flow from `api.domain.grade-essay-ai/route.ts` (thesis-default rubric path) was run twice against the live Anthropic API with identical essay text and rubric:');
  lines.push('');
  lines.push('- **Control** — redaction disabled: the real first name is sent straight into the prompt (current production behavior).');
  lines.push('- **Treatment** — redaction enabled: the real `buildRedactionMapping`/`redact` replace the first name with a pseudonym before the prompt is built AND redact it out of the essay body in prose mode, then the real `rehydrate` restores the real name in every returned comment (this branch\'s behavior).');
  lines.push('');
  const narrowed = results.filter((r) => r.commonWordName);
  if (narrowed.length > 0) {
    lines.push(`**Stated limitation.** ${narrowed.length} case(s) use a first name that is also an ordinary English word (${narrowed.map((r) => r.studentFirstName).join(', ')}). Prose redaction leaves the lowercase common word in place on purpose — redacting every "will" out of a philosophy essay would destroy the text we are asking the model to grade. For those cases the leak scan therefore counts only capitalized occurrences. A lowercase occurrence of such a name does remain in the outbound payload.`);
    lines.push('');
  }
  lines.push('## Score delta distribution (treatment − control, weighted total %)');
  lines.push('');
  lines.push('| mean | median | stdev | min | max | n |');
  lines.push('|---|---|---|---|---|---|');
  lines.push(`| ${dist.mean} | ${dist.median} | ${dist.stdev} | ${dist.min} | ${dist.max} | ${dist.n} |`);
  lines.push('');
  lines.push('## Name correctness');
  lines.push('');
  lines.push(`${nameCorrectPassCount}/${results.length} cases passed all name-correctness checks (control overallComment addresses the student by real name; treatment overallComment addresses the student by real name post-rehydration; no real-name leak into the treatment outbound prompt or raw response; no stray pseudonym left in the treatment final output).`);
  lines.push('');
  lines.push('## Blind judge (tone/warmth/specificity, order-randomized)');
  lines.push('');
  lines.push(`Control wins: ${judgeWins.control} | Treatment wins: ${judgeWins.treatment} | Ties: ${judgeWins.tie} (of ${results.length})`);
  lines.push('');
  lines.push('## Shared-first-name determinism check (Maya Thompson / Maya O\'Brien)');
  lines.push('');
  if (sharedNamePair.length === 2) {
    lines.push(
      sharedPseudonyms.size === 1
        ? `PASS — both students named "Maya" mapped to the same pseudonym ("${[...sharedPseudonyms][0]}"), confirming \`buildRedactionMapping\`'s shared-name → shared-pseudonym behavior across two separate live requests.`
        : `FAIL — the two "Maya" students mapped to *different* pseudonyms (${[...sharedPseudonyms].join(', ')}), which contradicts the documented shared-name → shared-pseudonym behavior in mapping.server.ts.`
    );
  } else {
    lines.push('Could not verify — one or both shared-name cases did not complete (see execution failures).');
  }
  lines.push('');

  lines.push('## Per-case table');
  lines.push('');
  lines.push('| id | band | control % | treatment % | Δ | name-correct | judge winner | groundedness note |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const groundNote =
      r.judge.winner === 'control'
        ? r.judge.aSide === 'control' ? r.judge.groundednessA : r.judge.groundednessB
        : r.judge.winner === 'treatment'
          ? r.judge.aSide === 'treatment' ? r.judge.groundednessA : r.judge.groundednessB
          : `${r.judge.groundednessA} / ${r.judge.groundednessB}`;
    lines.push(
      `| ${r.id} | ${r.band} | ${r.control.totalPercent} | ${r.treatment.totalPercent} | ${r.totalDelta >= 0 ? '+' : ''}${r.totalDelta} | ${r.nameCorrectness.pass ? 'PASS' : 'FAIL'} | ${r.judge.winner} | ${groundNote.replace(/\|/g, '/')} |`
    );
  }
  lines.push('');

  lines.push('## Failures and anomalies');
  lines.push('');
  if (leakFailures.length === 0 && nameCorrectPassCount === results.length && bigSwings.length === 0 && errors.length === 0) {
    lines.push('None. No PII leaks, no name-correctness failures, no individual score swing ≥10 points, no execution failures.');
  } else {
    if (leakFailures.length > 0) {
      lines.push('### PII leak failures (automatic FAIL)');
      lines.push('');
      for (const r of leakFailures) {
        lines.push(`- **${r.id}**:`);
        if (r.leaks.realNameInTreatmentOutboundPrompt.found) {
          lines.push(`  - Real name "${r.studentFirstName}" found in treatment outbound prompt: ${r.leaks.realNameInTreatmentOutboundPrompt.matches.join(', ')}`);
        }
        if (r.leaks.realNameInTreatmentRawResponse) {
          lines.push(`  - Real name "${r.studentFirstName}" found in treatment raw model response (pre-rehydrate).`);
        }
        if (r.leaks.pseudonymStrayInTreatmentFinalOutput.found) {
          lines.push(`  - Stray pseudonym "${r.pseudonymFirstName}" found in treatment FINAL output after rehydrate: ${r.leaks.pseudonymStrayInTreatmentFinalOutput.matches.join(', ')}`);
        }
      }
      lines.push('');
    }
    const nameFails = results.filter((r) => !r.nameCorrectness.pass && !leakFailures.includes(r));
    if (nameFails.length > 0) {
      lines.push('### Name-correctness failures');
      lines.push('');
      for (const r of nameFails) {
        lines.push(`- **${r.id}**: controlHasRealName=${r.nameCorrectness.controlOverallCommentHasRealName}, treatmentHasRealName=${r.nameCorrectness.treatmentOverallCommentHasRealName}`);
      }
      lines.push('');
    }
    if (bigSwings.length > 0) {
      lines.push('### Individual score anomalies (|Δ| ≥ 10 points)');
      lines.push('');
      for (const r of bigSwings) {
        lines.push(`- **${r.id}**: total delta ${r.totalDelta >= 0 ? '+' : ''}${r.totalDelta} points (control ${r.control.totalPercent}% → treatment ${r.treatment.totalPercent}%). Category deltas: ${r.categoryDeltas.map((d) => `${d.key} ${d.delta >= 0 ? '+' : ''}${d.delta}`).join(', ')}`);
      }
      lines.push('');
    }
    if (errors.length > 0) {
      lines.push('### Execution failures');
      lines.push('');
      for (const e of errors) {
        lines.push(`- **${e.id}**: ${e.error}`);
      }
      lines.push('');
    }
  }

  lines.push('## Full per-case detail');
  lines.push('');
  for (const r of results) {
    lines.push(`### ${r.id} (${r.band}) — ${r.note}`);
    lines.push('');
    lines.push(`Real name: ${r.studentFirstName} | Pseudonym used in treatment prompt: ${r.pseudonymFirstName}`);
    lines.push('');
    lines.push('**Control overallComment:**');
    lines.push('');
    lines.push(`> ${r.control.overallComment.replace(/\n/g, '\n> ')}`);
    lines.push('');
    lines.push('**Treatment overallComment (post-rehydrate):**');
    lines.push('');
    lines.push(`> ${r.treatment.overallComment.replace(/\n/g, '\n> ')}`);
    lines.push('');
    lines.push(`Judge: winner=${r.judge.winner} (raw ${r.judge.rawWinner}, A=${r.judge.aSide}) — ${r.judge.reason}`);
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const limit = Number(process.env.EVAL_LIMIT);
  const cases = Number.isFinite(limit) && limit > 0 ? corpus.slice(0, limit) : corpus;
  console.log(`Running AI redaction eval against ${cases.length} paired cases with model ${AI_MODEL}...`);
  const results: CaseResult[] = [];
  const errors: { id: string; error: string }[] = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    try {
      const result = await runCase(testCase, i, cases.length);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  FAILED: ${testCase.id}: ${message}`);
      errors.push({ id: testCase.id, error: message });
    }
    await sleep(500);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsPath = join(RESULTS_DIR, `results-${timestamp}.json`);
  const latestPath = join(RESULTS_DIR, 'latest.json');
  const payload = { generatedAt: new Date().toISOString(), model: AI_MODEL, results, errors };
  writeFileSync(resultsPath, JSON.stringify(payload, null, 2));
  writeFileSync(latestPath, JSON.stringify(payload, null, 2));

  const report = buildReport(results, errors);
  const reportPath = join(__dirname, 'report.md');
  writeFileSync(reportPath, report);

  console.log(`\nWrote ${resultsPath}`);
  console.log(`Wrote ${reportPath}`);
  console.log(`\nCompleted ${results.length}/${cases.length} paired cases (${errors.length} failed).`);
}

main().catch((err) => {
  console.error('Fatal error running eval:', err);
  process.exit(1);
});
