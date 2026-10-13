const DEIDENTIFICATION_VERSION = 1;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const USERNAME_RE = /(^|[\s([{"'])@([a-zA-Z0-9_][a-zA-Z0-9_.-]{1,31})\b/g;
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const CUID_RE = /\bcm[a-z0-9]{20,}\b/gi;

type Jsonish =
  | null
  | string
  | number
  | boolean
  | Jsonish[]
  | { [key: string]: Jsonish | undefined };

type LlmLogCreateData = {
  model: string;
  provider: string;
  systemPrompt?: string | null;
  messages: unknown;
  response?: string | null;
  error?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  durationMs?: number | null;
  metadata?: unknown;
};

const NAME_KEY_RE =
  /(^|_|\b)(name|firstName|lastName|fullName|displayName|preferredName|studentName|teacherName|username|userName|email)(s)?$/i;
const FILE_NAME_KEY_RE =
  /(^|[_-])file[_-]?name$|^fileName$|^filename$|^originalFileName$|^originalFilename$|^uploadFileName$|^uploadedFileName$/i;
const IDENTIFIER_KEY_RE =
  /(^id$|ids$|Id$|Ids$|_id$|_ids$|identifier$|email$|username$|userName$|name$|firstName$|lastName$|fullName$|displayName$|preferredName$|studentName$|teacherName$)/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addPhrase(phrases: Set<string>, value: unknown) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return;
  phrases.add(trimmed);
  for (const part of trimmed.split(/\s+/)) {
    if (part.length >= 3) phrases.add(part);
  }
}

function collectKnownPhrases(value: unknown, phrases = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKnownPhrases(item, phrases);
    return phrases;
  }

  if (!isPlainObject(value)) return phrases;

  for (const [key, child] of Object.entries(value)) {
    if (NAME_KEY_RE.test(key) || FILE_NAME_KEY_RE.test(key)) {
      if (Array.isArray(child)) {
        for (const item of child) addPhrase(phrases, item);
      } else {
        addPhrase(phrases, child);
      }
    }
    collectKnownPhrases(child, phrases);
  }

  return phrases;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function scrubString(value: string, knownPhrases: Set<string>) {
  let scrubbed = value
    .replace(EMAIL_RE, '[email]')
    .replace(UUID_RE, '[id]')
    .replace(CUID_RE, '[id]')
    .replace(USERNAME_RE, (_match, prefix) => `${prefix}@[username]`);

  const phrases = [...knownPhrases].sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    if (phrase.includes('@')) {
      scrubbed = scrubbed.replace(
        new RegExp(escapeRegExp(phrase), 'gi'),
        '[email]'
      );
      continue;
    }
    const replacement = phrase.startsWith('@') ? '@[username]' : '[name]';
    scrubbed = scrubbed.replace(
      new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi'),
      replacement
    );
  }

  return scrubbed;
}

function scrubJson(value: unknown, knownPhrases: Set<string>): Jsonish {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return scrubString(value, knownPhrases);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => scrubJson(item, knownPhrases));
  if (!isPlainObject(value)) return scrubString(String(value), knownPhrases);

  const scrubbed: Record<string, Jsonish> = {};
  for (const [key, child] of Object.entries(value)) {
    if (IDENTIFIER_KEY_RE.test(key) || FILE_NAME_KEY_RE.test(key)) continue;
    scrubbed[key] = scrubJson(child, knownPhrases);
  }
  return scrubbed;
}

function mergeDeidentificationMetadata(
  metadata: LlmLogCreateData['metadata'],
  knownPhrases: Set<string>
) {
  const scrubbed = scrubJson(metadata ?? {}, knownPhrases);
  const base = isPlainObject(scrubbed) ? scrubbed : {};
  return {
    ...base,
    deidentified: true,
    deidentificationVersion: DEIDENTIFICATION_VERSION,
  };
}

export function deidentifyLlmLogData(data: LlmLogCreateData): LlmLogCreateData {
  const knownPhrases = collectKnownPhrases({
    metadata: data.metadata,
    messages: data.messages,
  });

  return {
    ...data,
    systemPrompt:
      typeof data.systemPrompt === 'string'
        ? scrubString(data.systemPrompt, knownPhrases)
        : data.systemPrompt,
    messages: scrubJson(data.messages, knownPhrases),
    response:
      typeof data.response === 'string'
        ? scrubString(data.response, knownPhrases)
        : data.response,
    error:
      typeof data.error === 'string'
        ? scrubString(data.error, knownPhrases)
        : data.error,
    metadata: mergeDeidentificationMetadata(data.metadata, knownPhrases),
  };
}

export async function createDeidentifiedLlmLog(
  prisma: { llmLog: { create: (args: { data: any }) => Promise<unknown> } },
  data: LlmLogCreateData
) {
  return prisma.llmLog.create({ data: deidentifyLlmLogData(data) });
}

export function isLlmLogDeidentified(metadata: unknown) {
  return (
    isPlainObject(metadata) &&
    metadata.deidentified === true &&
    metadata.deidentificationVersion === DEIDENTIFICATION_VERSION
  );
}
