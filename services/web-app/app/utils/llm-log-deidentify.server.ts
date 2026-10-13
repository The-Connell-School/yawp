const DEIDENTIFICATION_VERSION = 1;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const USERNAME_RE = /(^|[\s([{"'])@([a-zA-Z0-9_][a-zA-Z0-9_.-]{1,31})\b/g;
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const CUID_RE = /\bc[a-z0-9]{20,}\b/gi;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE_RE =
  /(?<!\w)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\w)/g;
const SELF_IDENTIFIED_NAME_RE =
  /\b(I am|I'm|my name is|name is|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g;
const STUDENT_FIRST_NAME_RE =
  /\b(Student first name:\s*)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g;
const FEEDBACK_START_NAME_RE =
  /\b(start with\s+["'])([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})(,["'])/gi;
const OVERALL_COMMENT_NAME_RE =
  /(["']?overallComment["']?\s*:\s*["'])([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})(,)/g;
const LEADING_FEEDBACK_NAME_RE = /(^|[\n\r])([A-Z][a-z]{2,})(,)(?=\s)/g;
const COMMON_NAME_PARTS = new Set([
  'admin',
  'administrator',
  'author',
  'student',
  'teacher',
  'user',
]);

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
  deidentificationPhrases?: unknown;
};

const NAME_KEY_RE =
  /(^|_|\b)(name|firstName|lastName|fullName|displayName|preferredName|studentName|teacherName|username|userName|email)(s)?$/i;
const FILE_NAME_KEY_RE =
  /(^|[_-])file[_-]?name$|^fileName$|^filename$|^originalFileName$|^originalFilename$|^uploadFileName$|^uploadedFileName$/i;
const IDENTIFIER_KEY_RE =
  /(^id$|^ids$|Id$|Ids$|ID$|IDs$|_id$|_ids$|-id$|-ids$|identifier$|Identifier$|email$|Email$|username$|userName$|UserName$|name$|Name$|firstName$|FirstName$|lastName$|LastName$|fullName$|FullName$|displayName$|DisplayName$|preferredName$|PreferredName$|studentName$|StudentName$|teacherName$|TeacherName$|ipHash$|IpHash$|IPHash$|clientIpHash$|ClientIpHash$)/;

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

function addExplicitPhrase(phrases: Set<string>, value: unknown) {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return;
  phrases.add(trimmed);
  if (trimmed.includes('@') || trimmed.startsWith('@')) return;

  for (const part of trimmed.split(/\s+/)) {
    const normalized = part.toLowerCase().replace(/[^a-z]/g, '');
    if (part.length >= 3 && !COMMON_NAME_PARTS.has(normalized)) {
      phrases.add(part);
    }
  }
}

function addStringLeaves(phrases: Set<string>, value: unknown) {
  if (typeof value === 'string') {
    addPhrase(phrases, value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) addStringLeaves(phrases, item);
    return;
  }

  if (!isPlainObject(value)) return;
  for (const child of Object.values(value)) addStringLeaves(phrases, child);
}

function addExactStringLeaves(phrases: Set<string>, value: unknown) {
  if (typeof value === 'string') {
    addExplicitPhrase(phrases, value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) addExactStringLeaves(phrases, item);
    return;
  }

  if (!isPlainObject(value)) return;
  for (const child of Object.values(value)) {
    addExactStringLeaves(phrases, child);
  }
}

function collectKnownPhrases(value: unknown, phrases = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKnownPhrases(item, phrases);
    return phrases;
  }

  if (!isPlainObject(value)) return phrases;

  for (const [key, child] of Object.entries(value)) {
    if (
      NAME_KEY_RE.test(key) ||
      FILE_NAME_KEY_RE.test(key) ||
      IDENTIFIER_KEY_RE.test(key)
    ) {
      addStringLeaves(phrases, child);
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
    .replace(SSN_RE, '[id]')
    .replace(PHONE_RE, '[phone]')
    .replace(USERNAME_RE, (_match, prefix) => `${prefix}@[username]`)
    .replace(SELF_IDENTIFIED_NAME_RE, (_match, prefix) => `${prefix} [name]`)
    .replace(STUDENT_FIRST_NAME_RE, (_match, prefix) => `${prefix}[name]`)
    .replace(
      FEEDBACK_START_NAME_RE,
      (_match, prefix, _name, suffix) => `${prefix}[name]${suffix}`
    )
    .replace(
      OVERALL_COMMENT_NAME_RE,
      (_match, prefix, _name, suffix) => `${prefix}[name]${suffix}`
    )
    .replace(
      LEADING_FEEDBACK_NAME_RE,
      (_match, prefix, _name, suffix) => `${prefix}[name]${suffix}`
    );

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
  if (Array.isArray(value))
    return value.map((item) => scrubJson(item, knownPhrases));
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
  const { deidentificationPhrases: _, ...persistedData } = data;
  const knownPhrases = collectKnownPhrases({
    metadata: persistedData.metadata,
    messages: persistedData.messages,
  });
  addExactStringLeaves(knownPhrases, data.deidentificationPhrases);

  return {
    ...persistedData,
    systemPrompt:
      typeof persistedData.systemPrompt === 'string'
        ? scrubString(persistedData.systemPrompt, knownPhrases)
        : persistedData.systemPrompt,
    messages: scrubJson(persistedData.messages, knownPhrases),
    response:
      typeof persistedData.response === 'string'
        ? scrubString(persistedData.response, knownPhrases)
        : persistedData.response,
    error:
      typeof persistedData.error === 'string'
        ? scrubString(persistedData.error, knownPhrases)
        : persistedData.error,
    metadata: mergeDeidentificationMetadata(
      persistedData.metadata,
      knownPhrases
    ),
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
