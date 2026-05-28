import type { Prisma } from '@app/prisma';
import { getLLMCompletion } from '~/utils/getLLMCompletion';
import { parseFirstJsonValue } from '~/utils/llm-json.server';
import {
  apRubricRows,
  type ApEssayType,
  essayTypeLabel,
} from '~/domain/grading/ap-rubric';
import { getApRubricInstructions } from '~/domain/grading/ap-rubric-instructions';
import { runDetectors } from '~/domain/detectors/detector-framework';
import { apLangDetectors } from '~/domain/detectors/ap-lang-detectors';
import { apLitDetectors } from '~/domain/detectors/ap-lit-detectors';
import type { ApTutorContext } from '~/domain/ap-tutor-context';
import { coerceApRows } from './coerce-ap-rows';

export interface ApGradeResult {
  rubricScores: Record<string, Prisma.InputJsonValue>;
  overallScore: number;
  overallComment: string;
  score: string;
}

function detectorsFor(essayType: ApEssayType) {
  const apLitTypes: ApEssayType[] = [
    'poetry-analysis',
    'prose-fiction-analysis',
    'literary-argument',
  ];
  return apLitTypes.includes(essayType) ? apLitDetectors : apLangDetectors;
}

function buildApSystemPrompt(
  essayType: ApEssayType,
  studentFirstName: string
): string {
  const rubricInstructions = getApRubricInstructions(essayType);
  const rowSpec = apRubricRows
    .map((r) => `${r.key} (0–${r.maxPoints})`)
    .join(', ');

  return [
    `You are an AP English grading assistant scoring a ${essayTypeLabel(essayType)} essay against the College Board's additive rubric.`,
    rubricInstructions,
    `Return ONLY valid JSON with this schema:`,
    `{
  "rows": [{"key": string, "score": number, "comment": string}],
  "overallComment": string
}`,
    `Return exactly one entry per rubric row. Valid row keys and ranges: ${rowSpec}.`,
    `Scores are integers within each row's range. The rubric is additive — award each point independently; do not subtract for errors.`,
    `Each row comment should explain why the point was or was not earned, in the rubric's vocabulary.`,
    `In overallComment, start with "${studentFirstName}," and give warm, specific, actionable feedback focused on the highest-leverage improvement.`,
    `Never include markdown fences or explanatory text outside the JSON.`,
  ].join('\n\n');
}

export async function gradeApEssay({
  essayType,
  essayText,
  sources,
  studentFirstName,
  model,
}: {
  essayType: ApEssayType;
  essayText: string;
  sources: ApTutorContext['sourcePassages'];
  studentFirstName: string;
  model: string;
}): Promise<ApGradeResult | null> {
  const system = buildApSystemPrompt(essayType, studentFirstName);

  const sourcesBlock =
    sources.length > 0
      ? `\n\nThe student was given these sources:\n${sources
          .map((s) => `${[s.label, s.title, s.attribution].filter(Boolean).join(' — ')}\n${s.body}`)
          .join('\n\n---\n\n')}`
      : '';

  const userPrompt = `Essay to score:\n${essayText}${sourcesBlock}`;

  const responseText = await getLLMCompletion({
    model,
    system,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 1200,
    temperature: 0,
    metadata: { feature: 'grading', kind: 'ap-rubric', essayType },
  });

  const rows = coerceApRows(parseFirstJsonValue(responseText));
  if (!rows) return null;

  const parsedOuter = parseFirstJsonValue(responseText) as {
    overallComment?: unknown;
  };
  const overallComment =
    typeof parsedOuter.overallComment === 'string'
      ? parsedOuter.overallComment
      : `${studentFirstName}, see the rubric notes for detailed feedback.`;

  const detectors = runDetectors(detectorsFor(essayType), essayText, essayType);

  const rubricScores = rows.reduce<Record<string, Prisma.InputJsonValue>>(
    (acc, row) => {
      acc[row.key] = { score: row.score, comment: row.comment, isAi: true };
      return acc;
    },
    {}
  );
  rubricScores.detectors = detectors as unknown as Prisma.InputJsonValue;

  const overallScore = rows.reduce((sum, r) => sum + r.score, 0);

  return {
    rubricScores,
    overallScore,
    overallComment,
    score: `${overallScore}/6`,
  };
}
