import type { DraftingPhase } from './types';

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

