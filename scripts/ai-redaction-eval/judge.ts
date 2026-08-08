/**
 * Blind pairwise LLM-judge for tone/specificity/groundedness comparison
 * between a control and treatment overallComment. Order is randomized per
 * case before the call so position bias cancels out across the corpus, and
 * the raw "A/B" verdict plus the randomization outcome are both recorded
 * for auditability (per the eval brief).
 */
import { anthropic } from '../../services/web-app/app/services/anthropic';
import { extractFirstJsonObject } from './json-parse';
import { AI_MODEL } from './llm';

export interface JudgeVerdict {
  /** Which side was assigned to "A" for this call: 'control' or 'treatment'. */
  aSide: 'control' | 'treatment';
  /** Raw winner as reported by the model: 'A' | 'B' | 'tie'. */
  rawWinner: 'A' | 'B' | 'tie';
  /** rawWinner mapped back to control/treatment/tie using aSide. */
  winner: 'control' | 'treatment' | 'tie';
  reason: string;
  groundednessA: string;
  groundednessB: string;
}

const JUDGE_SYSTEM = `You are a blind quality judge comparing two pieces of feedback written by an essay-grading assistant for the same essay and rubric. You do not know which system produced which comment, and you must not guess. Judge only on the text given.

Return ONLY valid JSON with this schema:
{
  "winner": "A" | "B" | "tie",
  "reason": string,
  "groundednessA": string,
  "groundednessB": string
}

Judge on: warmth, specificity to the actual essay content (does it reference concrete details, quotes, or claims from the essay, or is it generic filler?), and overall usefulness to the student. "groundednessA"/"groundednessB" should each be a one-sentence note on whether that comment cites specific essay content or stays generic. Prefer "tie" only if the two comments are genuinely indistinguishable in quality.`;

export async function judgePair({
  essayText,
  controlComment,
  treatmentComment,
}: {
  essayText: string;
  controlComment: string;
  treatmentComment: string;
}): Promise<JudgeVerdict> {
  const aSide: 'control' | 'treatment' = Math.random() < 0.5 ? 'control' : 'treatment';
  const commentA = aSide === 'control' ? controlComment : treatmentComment;
  const commentB = aSide === 'control' ? treatmentComment : controlComment;

  const userPrompt = `Essay:\n${essayText}\n\nComment A:\n${commentA}\n\nComment B:\n${commentB}`;

  const message = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 400,
    temperature: 0.2,
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const textBlock = message.content.find((b) => b.type === 'text');
  const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
  const parsed = extractFirstJsonObject(raw) as Record<string, unknown> | null;

  const rawWinner: 'A' | 'B' | 'tie' =
    parsed?.winner === 'A' || parsed?.winner === 'B' || parsed?.winner === 'tie'
      ? parsed.winner
      : 'tie';

  const winner: 'control' | 'treatment' | 'tie' =
    rawWinner === 'tie' ? 'tie' : rawWinner === 'A' ? aSide : aSide === 'control' ? 'treatment' : 'control';

  return {
    aSide,
    rawWinner,
    winner,
    reason: typeof parsed?.reason === 'string' ? parsed.reason : '(no reason returned)',
    groundednessA:
      typeof parsed?.groundednessA === 'string' ? parsed.groundednessA : '',
    groundednessB:
      typeof parsed?.groundednessB === 'string' ? parsed.groundednessB : '',
  };
}
