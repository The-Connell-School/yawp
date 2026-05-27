import type { ApEssayType } from '../grading/ap-rubric';

export interface SourcePassage {
  label: string;
  title?: string;
  attribution?: string;
  body: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface ApExtractionResult {
  title?: string;
  prompt: string;
  sources?: SourcePassage[];
  poet?: string;
  author?: string;
  sourceWork?: string;
  year?: number;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseSourcePassage(raw: unknown): SourcePassage | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!isNonEmptyString(obj.label) || !isNonEmptyString(obj.body)) return null;
  return {
    label: (obj.label as string).trim(),
    title: isNonEmptyString(obj.title) ? (obj.title as string).trim() : undefined,
    attribution: isNonEmptyString(obj.attribution) ? (obj.attribution as string).trim() : undefined,
    body: (obj.body as string).trim(),
    confidence:
      obj.confidence === 'high' || obj.confidence === 'medium' || obj.confidence === 'low'
        ? obj.confidence
        : undefined,
  };
}

export function parseApExtractionResult(raw: unknown): ApExtractionResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AP extraction result must be an object');
  }
  const obj = raw as Record<string, unknown>;

  if (!isNonEmptyString(obj.prompt)) {
    throw new Error('AP extraction result must have a non-empty prompt');
  }

  const sources: SourcePassage[] | undefined = Array.isArray(obj.sources)
    ? (obj.sources.map(parseSourcePassage).filter(Boolean) as SourcePassage[])
    : undefined;

  return {
    title: isNonEmptyString(obj.title) ? (obj.title as string).trim() : undefined,
    prompt: (obj.prompt as string).trim(),
    sources: sources && sources.length > 0 ? sources : undefined,
    poet: isNonEmptyString(obj.poet) ? (obj.poet as string).trim() : undefined,
    author: isNonEmptyString(obj.author) ? (obj.author as string).trim() : undefined,
    sourceWork: isNonEmptyString(obj.sourceWork) ? (obj.sourceWork as string).trim() : undefined,
    year: typeof obj.year === 'number' && Number.isInteger(obj.year) ? obj.year : undefined,
  };
}

export function buildApExtractionSystemPrompt(essayType: ApEssayType): string {
  const base =
    'You extract AP English assignment prompts from PDFs. Return only valid JSON. Never include markdown fences or explanatory text.';

  const schemas: Record<ApEssayType, string> = {
    synthesis: `${base}
Return JSON with this shape:
{
  "title": "string (optional, short title for the prompt)",
  "prompt": "string (the full essay prompt / question students must respond to)",
  "sources": [
    {
      "label": "string (e.g. 'Source A', 'Source B')",
      "title": "string (title of the source document, if given)",
      "attribution": "string (author, publication, date — if given)",
      "body": "string (full text of the source passage)",
      "confidence": "'high' | 'medium' | 'low' (how confident you are in the extraction)"
    }
  ],
  "year": number (optional, year the prompt was published if identifiable)
}
Extract all source passages (typically 6-7). Preserve paragraph breaks within each source body. If a source includes a chart or image description, describe it in the body field.`,

    'rhetorical-analysis': `${base}
Return JSON with this shape:
{
  "title": "string (optional)",
  "prompt": "string (the full essay prompt)",
  "sources": [
    {
      "label": "string (e.g. 'Passage')",
      "title": "string (title of the speech/letter/editorial)",
      "attribution": "string (author, date, occasion)",
      "body": "string (full text of the passage)"
    }
  ],
  "author": "string (author of the passage)",
  "year": number (optional)
}
Extract exactly one source passage. Preserve the full text including paragraph breaks.`,

    'poetry-analysis': `${base}
Return JSON with this shape:
{
  "title": "string (optional)",
  "prompt": "string (the full essay prompt)",
  "sources": [
    {
      "label": "string (e.g. 'Poem')",
      "title": "string (title of the poem)",
      "attribution": "string (poet name, year if given)",
      "body": "string (full text of the poem — PRESERVE ALL LINE BREAKS exactly as they appear)"
    }
  ],
  "poet": "string (name of the poet)",
  "year": number (optional)
}
CRITICAL: Preserve every line break in the poem exactly. Each line of poetry must be on its own line. Stanza breaks must be preserved as blank lines.`,

    'prose-fiction-analysis': `${base}
Return JSON with this shape:
{
  "title": "string (optional)",
  "prompt": "string (the full essay prompt)",
  "sources": [
    {
      "label": "string (e.g. 'Passage')",
      "title": "string (title of the work the passage is from)",
      "attribution": "string (author, year, source work)",
      "body": "string (full text of the prose passage)"
    }
  ],
  "author": "string (author name)",
  "sourceWork": "string (title of the novel/story the passage is from)",
  "year": number (optional)
}
Preserve paragraph breaks within the passage.`,

    argument: `${base}
Return JSON with this shape:
{
  "title": "string (optional)",
  "prompt": "string (the full essay prompt including any quotation or claim students must respond to)",
  "year": number (optional)
}
Argument prompts have no source passages — just the prompt itself.`,

    'literary-argument': `${base}
Return JSON with this shape:
{
  "title": "string (optional)",
  "prompt": "string (the full essay prompt)",
  "year": number (optional)
}
Literary Argument prompts have no source passages — just the prompt. If a list of suggested works is included, put it at the end of the prompt field.`,
  };

  return schemas[essayType];
}

export function buildApExtractionUserPrompt(essayType: ApEssayType): string {
  const instructions: Record<ApEssayType, string> = {
    synthesis:
      'Extract the AP Lang Synthesis prompt and all source passages. Return strict JSON only.',
    'rhetorical-analysis':
      'Extract the AP Lang Rhetorical Analysis prompt and the passage. Return strict JSON only.',
    'poetry-analysis':
      'Extract the AP Lit Poetry Analysis prompt and the poem. Preserve all line breaks. Return strict JSON only.',
    'prose-fiction-analysis':
      'Extract the AP Lit Prose Fiction Analysis prompt and the passage. Return strict JSON only.',
    argument:
      'Extract the AP Lang Argument prompt. Return strict JSON only.',
    'literary-argument':
      'Extract the AP Lit Literary Argument prompt. Return strict JSON only.',
  };

  return instructions[essayType];
}
