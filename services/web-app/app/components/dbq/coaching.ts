import type { DbqPrompt, DraftingPhase, FailureFlag } from './types';

export const phaseHints: Record<DraftingPhase, string> = {
  'source-analysis':
    'Read each document for what it claims, who is speaking, and why. Sourcing (HIPP) is the move — not summary.',
  thesis:
    'Take a position on “extent.” A thesis that says “some goals were achieved but X reversed them” beats one that hedges.',
  contextualization:
    'A sentence or two of broader context before or just outside the prompt window. Avoid generic “Throughout history” openers.',
  drafting:
    'Each body paragraph should advance the thesis with at least one document and one piece of outside evidence.',
  revision:
    'Re-read for: thesis still defensible, sourcing on at least two documents, complexity move present.',
};

// Quick-and-dirty client-side stand-ins for the named failure-mode detectors.
// Real implementation runs server-side via packages/tutor.
export function detectFailureFlags(
  essay: string,
  prompt: DbqPrompt
): FailureFlag[] {
  const flags: FailureFlag[] = [];
  const trimmed = essay.trim();
  if (!trimmed) return flags;

  // thesis-restates-prompt: first sentence shares 4+ content words with the prompt.
  const firstSentence = trimmed.split(/(?<=[.!?])\s/)[0] ?? '';
  const promptWords = new Set(
    prompt.prompt
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4)
  );
  const overlap = firstSentence
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => promptWords.has(w)).length;
  if (overlap >= 4) {
    flags.push({
      id: 'thesis-restates-prompt',
      label: 'Thesis may be restating the prompt',
      detail:
        'Your opener echoes the prompt closely. Try staking a position the prompt does not.',
    });
  }

  // walking-through-documents: doc tokens appear in alphabetical order, 4+ in a row.
  const tokens = Array.from(essay.matchAll(/\[Doc ([A-G])\]/g)).map(
    (m) => m[1]
  );
  let inOrderRun = 1;
  let maxRun = 1;
  for (let i = 1; i < tokens.length; i++) {
    if (
      tokens[i].charCodeAt(0) === tokens[i - 1].charCodeAt(0) + 1 ||
      tokens[i] === tokens[i - 1]
    ) {
      inOrderRun++;
      maxRun = Math.max(maxRun, inOrderRun);
    } else {
      inOrderRun = 1;
    }
  }
  if (maxRun >= 4) {
    flags.push({
      id: 'walking-through-documents',
      label: 'Walking through documents in order',
      detail:
        'Citations are appearing A → B → C in sequence. Reorganize around argument, not document order.',
    });
  }

  // length-not-sophistication: very long without complexity-signalling phrases.
  const wordCount = trimmed.split(/\s+/).length;
  const hasComplexitySignal =
    /\b(however|although|nevertheless|while|whereas|on the other hand|despite)\b/i.test(
      essay
    );
  if (wordCount > 350 && !hasComplexitySignal) {
    flags.push({
      id: 'length-not-sophistication',
      label: 'Length without complexity',
      detail:
        'You are 350+ words in without a qualifier or counter-move (however, although, whereas…). Add nuance, not paragraphs.',
    });
  }

  return flags;
}

export function suggestNextPhase(
  current: DraftingPhase,
  essay: string,
  thesisDraft: string
): DraftingPhase | null {
  const wordCount = essay.trim() ? essay.trim().split(/\s+/).length : 0;
  if (current === 'source-analysis' && thesisDraft.length > 30) return 'thesis';
  if (current === 'thesis' && thesisDraft.length > 60) return 'contextualization';
  if (current === 'contextualization' && wordCount > 60) return 'drafting';
  if (current === 'drafting' && wordCount > 300) return 'revision';
  return null;
}
