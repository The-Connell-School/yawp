import { findExcerptRange } from '~/utils/excerpt-position';

export type GrammarIssue = {
  id: string;
  excerpt: string;
  occurrence?: number;
  kind: 'error' | 'style';
  ruleNumber?: number;
  rule?: string;
  message: string;
};

const MAX_ISSUES = 25;
const MAX_EXCERPT = 120;
const MAX_MESSAGE = 280;
const MAX_RULE = 120;

function normalizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function tryParseJsonString(value: unknown): unknown {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return rounded > 0 ? rounded : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function toNonNegativeInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return rounded >= 0 ? rounded : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
}

function toKind(value: unknown): 'error' | 'style' {
  if (typeof value !== 'string') return 'error';
  return value.toLowerCase() === 'style' ? 'style' : 'error';
}

function fallbackIssueId(index: number, excerpt: string) {
  const slug = excerpt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  return `grammar-${index + 1}-${slug || 'issue'}`;
}

function getIssueCandidates(raw: unknown): unknown[] {
  const parsedRaw = tryParseJsonString(raw);
  if (parsedRaw !== null) {
    return getIssueCandidates(parsedRaw);
  }

  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'object') return [];

  const issues = (raw as { issues?: unknown }).issues;
  if (Array.isArray(issues)) return issues;
  const parsedIssues = tryParseJsonString(issues);
  if (Array.isArray(parsedIssues)) return parsedIssues;

  const grammarIssues = (raw as { grammarIssues?: unknown }).grammarIssues;
  if (Array.isArray(grammarIssues)) return grammarIssues;
  const parsedGrammarIssues = tryParseJsonString(grammarIssues);
  if (Array.isArray(parsedGrammarIssues)) return parsedGrammarIssues;

  return [];
}

function normalizeExcerptForSource(args: {
  sourceText?: string;
  excerpt: string;
  occurrence?: number;
}): { excerpt: string | null; occurrence?: number } {
  const { sourceText } = args;
  let { excerpt, occurrence } = args;

  if (!sourceText) return { excerpt, occurrence };

  const targetOccurrence = occurrence ?? 1;
  if (findExcerptRange(sourceText, excerpt, targetOccurrence)) {
    return { excerpt, occurrence };
  }

  const withoutEdgePunctuation = excerpt
    .replace(/^[`"'([{]+/, '')
    .replace(/[`"')\]}.,;:!?]+$/, '')
    .trim();

  if (
    withoutEdgePunctuation &&
    findExcerptRange(sourceText, withoutEdgePunctuation, targetOccurrence)
  ) {
    return { excerpt: withoutEdgePunctuation, occurrence };
  }
  if (findExcerptRange(sourceText, excerpt, 1)) {
    return { excerpt, occurrence: 1 };
  }

  return { excerpt: null, occurrence };
}

function normalizeIssue(
  rawIssue: unknown,
  index: number,
  sourceText?: string
): GrammarIssue | null {
  const parsedRawIssue = tryParseJsonString(rawIssue);
  if (parsedRawIssue !== null) {
    return normalizeIssue(parsedRawIssue, index, sourceText);
  }

  if (!rawIssue || typeof rawIssue !== 'object') return null;

  const issue = rawIssue as Record<string, unknown>;
  let excerpt =
    normalizeText(issue.excerpt, MAX_EXCERPT) ??
    normalizeText(issue.text, MAX_EXCERPT) ??
    normalizeText(issue.span, MAX_EXCERPT) ??
    normalizeText(issue.snippet, MAX_EXCERPT) ??
    normalizeText(issue.quote, MAX_EXCERPT) ??
    normalizeText(issue.selection, MAX_EXCERPT);
  const message =
    normalizeText(issue.message, MAX_MESSAGE) ??
    normalizeText(issue.reason, MAX_MESSAGE) ??
    normalizeText(issue.explanation, MAX_MESSAGE) ??
    normalizeText(issue.comment, MAX_MESSAGE) ??
    normalizeText(issue.description, MAX_MESSAGE) ??
    normalizeText(issue.details, MAX_MESSAGE) ??
    normalizeText(issue.note, MAX_MESSAGE) ??
    normalizeText(issue.problem, MAX_MESSAGE) ??
    normalizeText(issue.issue, MAX_MESSAGE);

  const start =
    toNonNegativeInt(issue.start) ?? toNonNegativeInt(issue.startIndex);
  const end = toNonNegativeInt(issue.end) ?? toNonNegativeInt(issue.endIndex);
  if (
    !excerpt &&
    sourceText &&
    start !== undefined &&
    end !== undefined &&
    end > start
  ) {
    excerpt = normalizeText(sourceText.slice(start, end), MAX_EXCERPT);
  }

  if (!excerpt) return null;

  const normalizedMessage =
    message ??
    normalizeText(issue.rule, MAX_MESSAGE) ??
    normalizeText(issue.name, MAX_MESSAGE) ??
    (toKind(issue.kind) === 'style'
      ? 'This phrasing is stylistically weak or wordy.'
      : 'This appears to violate grammar or usage conventions.');

  let occurrence = toPositiveInt(issue.occurrence);
  const normalizedExcerpt = normalizeExcerptForSource({
    sourceText,
    excerpt,
    occurrence,
  });
  if (normalizedExcerpt.excerpt === null) return null;
  excerpt = normalizedExcerpt.excerpt;
  occurrence = normalizedExcerpt.occurrence;

  const idValue =
    normalizeText(issue.id, 120) ?? fallbackIssueId(index, excerpt);

  return {
    id: idValue,
    excerpt,
    occurrence,
    kind: toKind(issue.kind),
    ruleNumber: toPositiveInt(issue.ruleNumber),
    rule:
      normalizeText(issue.rule, MAX_RULE) ??
      normalizeText(issue.name, MAX_RULE) ??
      undefined,
    message: normalizedMessage.slice(0, MAX_MESSAGE),
  };
}

export function parseGrammarIssuesPayload(
  raw: unknown,
  opts?: { sourceText?: string }
): GrammarIssue[] {
  const sourceText = opts?.sourceText;
  const candidates = getIssueCandidates(raw);
  if (candidates.length === 0) return [];

  const issues: GrammarIssue[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < candidates.length; i++) {
    const normalized = normalizeIssue(candidates[i], i, sourceText);
    if (!normalized) continue;
    const dedupeKey = [
      normalized.excerpt.toLowerCase(),
      normalized.occurrence ?? 1,
      normalized.message.toLowerCase(),
    ].join('|');
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    issues.push(normalized);
    if (issues.length >= MAX_ISSUES) break;
  }

  return issues;
}
