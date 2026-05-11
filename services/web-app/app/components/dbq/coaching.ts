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

export const phaseTutorIntro: Record<DraftingPhase, string> = {
  'source-analysis':
    "Let's start with the documents. Skim each one for who is speaking and what they're claiming about Reconstruction — don't worry about citing yet.",
  thesis:
    'Ready to take a stand. What position on *extent* does the evidence push you toward? Try writing one sentence in the editor.',
  contextualization:
    'Now a sentence or two of broader context — something just outside the prompt window that explains how we got here.',
  drafting:
    'Time to draft. Each body paragraph should advance the thesis with at least one document and one piece of outside knowledge.',
  revision:
    "You've got a draft. Re-read for: thesis still defensible, sourcing on at least two documents, a complexity move present.",
};

export function detectFailureFlags(
  essay: string,
  prompt: DbqPrompt
): FailureFlag[] {
  const flags: FailureFlag[] = [];
  const trimmed = essay.trim();
  if (!trimmed) return flags;

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
  if (current === 'thesis' && thesisDraft.length > 60)
    return 'contextualization';
  if (current === 'contextualization' && wordCount > 60) return 'drafting';
  if (current === 'drafting' && wordCount > 300) return 'revision';
  return null;
}

// Stand-in for an LLM tutor turn. Keyword-routes the student's question to a
// canned reply so the chat surface feels alive in the prototype.
export function cannedTutorReply(question: string): string {
  const q = question.toLowerCase();
  if (/thesis/.test(q)) {
    return 'A strong DBQ thesis stakes a position on *extent* — try naming one goal that was achieved AND one that was reversed, then explain why both happened.';
  }
  if (/context|contextualiz/.test(q)) {
    return 'Contextualization is a sentence or two just outside the prompt window. For this prompt, the end of the Civil War (1865) or earlier abolitionist debates work well — anything that explains how Reconstruction even became possible.';
  }
  if (/hipp|sourcing|source\b/.test(q)) {
    return 'Sourcing means accounting for at least one document’s Historical context, Intended audience, Purpose, or Point of view — and why that matters for your argument. Doc B (Edisto petition) and Doc F (Civil Rights Cases) are juicy for this.';
  }
  if (/outside|evidence/.test(q)) {
    return 'Outside evidence is anything relevant that isn’t in the documents. Strong moves for this prompt: the Compromise of 1877, Plessy v. Ferguson (1896), sharecropping, the collapse of the Freedmen’s Bureau.';
  }
  if (/complex/.test(q)) {
    return 'Complexity points reward nuance. You can earn one by qualifying your thesis (“while X was achieved on paper, Y reversed it in practice”) or by addressing a counterargument and explaining why your position still holds.';
  }
  if (/start|begin|where do i/.test(q)) {
    return 'Start with the documents. Note who is speaking, what they’re claiming, and whether they suggest a Reconstruction goal achieved or reversed. Then we’ll group them and write a thesis.';
  }
  return 'Tell me more — which document or which part of the prompt are you working through right now?';
}
