/**
 * Teacher's Lounge topics. Staff-curated product areas, so the Yawp team can
 * triage and module pages can later filter the feed to themselves. Keys are
 * stored on LoungePost.topic; never rename one, only add.
 */
export const LOUNGE_TOPICS = [
  { key: 'writing-lessons', label: 'Writing Lessons' },
  { key: 'daily-pages', label: 'Daily Pages' },
  { key: 'thesis-essays', label: 'Thesis & Essays' },
  { key: 'grading', label: 'Grading & Rubrics' },
  { key: 'reporter', label: 'Reporter' },
  { key: 'lesson-planner', label: 'Lesson Planner' },
  { key: 'ap-history', label: 'AP History' },
  { key: 'classroom-routines', label: 'Classroom Routines' },
  { key: 'other', label: 'Something else' },
] as const;

export type LoungeTopicKey = (typeof LOUNGE_TOPICS)[number]['key'];

export function isLoungeTopic(value: unknown): value is LoungeTopicKey {
  return LOUNGE_TOPICS.some((topic) => topic.key === value);
}

export function loungeTopicLabel(key: string): string {
  return LOUNGE_TOPICS.find((topic) => topic.key === key)?.label ?? 'Something else';
}

export const LOUNGE_POST_KINDS = [
  { key: 'QUESTION', label: 'Question', titleLabel: 'Your question, in one line' },
  { key: 'SHARE', label: 'Share', titleLabel: 'What are you sharing?' },
  { key: 'WIN', label: 'Win', titleLabel: 'What happened?' },
] as const;

export type LoungePostKindKey = (typeof LOUNGE_POST_KINDS)[number]['key'];

export function isLoungePostKind(value: unknown): value is LoungePostKindKey {
  return LOUNGE_POST_KINDS.some((kind) => kind.key === value);
}
