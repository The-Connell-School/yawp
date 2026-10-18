/**
 * Faculty Lounge topics. They match YAWP!'s features, so the team can track
 * what teachers talk about and module pages can later filter the feed to
 * themselves. Keys are stored on LoungePost.topic; never rename one, only add.
 * Relabel freely, and retire a topic (hide it from the composer) instead of
 * removing it, so posts that already use it keep their label.
 */
export const LOUNGE_TOPICS = [
  { key: 'writing-lessons', label: 'Writing practice' },
  { key: 'daily-pages', label: 'Class starters' },
  { key: 'thesis-essays', label: 'Thesis development' },
  { key: 'grading', label: 'Grading & rubrics' },
  { key: 'reporter', label: 'Reporter' },
  { key: 'lesson-planner', label: 'Lesson planner' },
  // Free-tier teachers don't have AP History.
  { key: 'ap-history', label: 'AP History', retired: true },
  { key: 'classroom-routines', label: 'Classroom routines' },
  { key: 'prewriting', label: 'Prewriting' },
  {
    key: 'lessons-learned',
    label: 'Lessons learned',
    hint: 'What you used to do, what you do now, and why it changed.',
  },
  { key: 'other', label: 'Something else' },
] as const;

export type LoungeTopicKey = (typeof LOUNGE_TOPICS)[number]['key'];

type LoungeTopic = { key: LoungeTopicKey; label: string; retired?: boolean; hint?: string };

/** The topics a teacher can pick for a new post, in Brian's order. */
export const COMPOSER_TOPICS: LoungeTopic[] = (LOUNGE_TOPICS as readonly LoungeTopic[]).filter(
  (topic) => !topic.retired
);

export function isLoungeTopic(value: unknown): value is LoungeTopicKey {
  return LOUNGE_TOPICS.some((topic) => topic.key === value);
}

export function isComposerTopic(value: unknown): value is LoungeTopicKey {
  return COMPOSER_TOPICS.some((topic) => topic.key === value);
}

export function loungeTopicLabel(key: string): string {
  return LOUNGE_TOPICS.find((topic) => topic.key === key)?.label ?? 'Something else';
}

export const LOUNGE_POST_KINDS = [
  {
    key: 'QUESTION',
    label: 'General question',
    prompt: 'Ask anything about teaching writing or using YAWP!',
    titleLabel: 'Your question, in one line',
    attachesLesson: false,
  },
  {
    key: 'SHARE',
    label: 'Share an assignment',
    prompt: 'Share an assignment that worked. What made it land?',
    titleLabel: 'Name the assignment',
    attachesLesson: true,
  },
  {
    key: 'WIN',
    label: 'Win',
    prompt:
      'Share a sample of student work that made you happy or proud this week. Remember to take the student’s name off.',
    titleLabel: 'What happened?',
    attachesLesson: false,
  },
] as const;

export type LoungePostKindKey = (typeof LOUNGE_POST_KINDS)[number]['key'];

export function isLoungePostKind(value: unknown): value is LoungePostKindKey {
  return LOUNGE_POST_KINDS.some((kind) => kind.key === value);
}

export function loungeKindLabel(key: LoungePostKindKey): string {
  return LOUNGE_POST_KINDS.find((kind) => kind.key === key)?.label ?? key;
}

export function kindAttachesLesson(key: LoungePostKindKey): boolean {
  return LOUNGE_POST_KINDS.find((kind) => kind.key === key)?.attachesLesson ?? false;
}
