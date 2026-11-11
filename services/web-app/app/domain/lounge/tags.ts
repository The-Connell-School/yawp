import { LOUNGE_TOPICS, loungeTopicLabel, type LoungePostKindKey, type LoungeTopicKey } from './topics';

/**
 * A post's tags (Brian's review, Nov 11 2026): under the details, the
 * teacher checks every post type, subject, and module or topic that applies.
 *
 * Backward compatible: posts written before tags keep only `kind` and
 * `topic`, and read as if those were their tags. New posts still fill
 * `kind` and `topic` from their first tags, so the Unanswered list, the
 * inbox, and anything else reading the old columns keep working.
 */

/** The post types the form offers. Win is no longer offered; old Wins keep it. */
export const LOUNGE_FORM_KINDS = [
  { key: 'QUESTION', label: 'Question' },
  { key: 'SHARE', label: 'Share' },
] as const satisfies ReadonlyArray<{ key: LoungePostKindKey; label: string }>;

/** Keys are stored on LoungePost.subjects; never rename one, only add. */
export const LOUNGE_SUBJECTS = [
  { key: 'english', label: 'English' },
  { key: 'social-studies', label: 'Social Studies' },
  { key: 'history', label: 'History' },
  { key: 'science', label: 'Science' },
  { key: 'other-subject', label: 'Another subject' },
] as const;

/** Every topic but "Something else", which is what no topic checked means. */
export const LOUNGE_FORM_TOPICS = LOUNGE_TOPICS.filter((topic) => topic.key !== 'other');

export type LoungeSubjectKey = (typeof LOUNGE_SUBJECTS)[number]['key'];

export type LoungePostTags = {
  kinds: LoungePostKindKey[];
  subjects: string[];
  topics: string[];
};

type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

function values(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return typeof value === 'string' && value ? [value] : [];
}

/** The chosen keys, in the order the form lists them, each once. */
function pick<K extends string>(options: ReadonlyArray<{ key: K }>, chosen: unknown): K[] {
  const set = new Set(values(chosen).map((value) => value.trim()));
  return options.filter((option) => set.has(option.key)).map((option) => option.key);
}

export function parseLoungeTags(input: Record<string, unknown>): Result<LoungePostTags> {
  const kinds = pick(LOUNGE_FORM_KINDS, input.kinds);
  if (kinds.length === 0) return { ok: false, errors: { kinds: 'Choose Question, Share, or both.' } };
  return {
    ok: true,
    value: {
      kinds,
      subjects: pick(LOUNGE_SUBJECTS, input.subjects),
      topics: pick(LOUNGE_FORM_TOPICS, input.topics),
    },
  };
}

/** The old single-choice columns, filled from the tags (dual-write). */
export function legacyLoungeColumns(tags: LoungePostTags): { kind: LoungePostKindKey; topic: LoungeTopicKey } {
  const kind = tags.kinds.includes('QUESTION') ? 'QUESTION' : (tags.kinds[0] ?? 'QUESTION');
  const topic = (LOUNGE_FORM_TOPICS.find((option) => tags.topics.includes(option.key))?.key ?? 'other') as LoungeTopicKey;
  return { kind, topic };
}

/** A stored post's tags, reading the old columns for posts from before tags. */
export function resolveLoungePostTags(row: {
  kind: LoungePostKindKey;
  topic: string;
  kinds: LoungePostKindKey[];
  subjects: string[];
  topics: string[];
}): LoungePostTags {
  if (row.kinds.length > 0) {
    return { kinds: [...row.kinds], subjects: [...row.subjects], topics: [...row.topics] };
  }
  return { kinds: [row.kind], subjects: [...row.subjects], topics: row.topic === 'other' ? [] : [row.topic] };
}

export type LoungeTagLabel = { key: string; label: string; topic: string | null };

/** What a post shows as tags: subjects, then topics (each a feed filter). */
export function loungeTagLabels(tags: LoungePostTags): LoungeTagLabel[] {
  const subjects = tags.subjects.flatMap((key) => {
    const subject = LOUNGE_SUBJECTS.find((option) => option.key === key);
    return subject ? [{ key: `subject:${key}`, label: subject.label, topic: null }] : [];
  });
  const topics = tags.topics
    .filter((key) => LOUNGE_TOPICS.some((option) => option.key === key) && key !== 'other')
    .map((key) => ({ key: `topic:${key}`, label: loungeTopicLabel(key), topic: key }));
  return [...subjects, ...topics];
}
