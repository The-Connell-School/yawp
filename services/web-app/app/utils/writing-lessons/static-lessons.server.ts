import promptContent from './prompt-content';

type LessonMetadata = {
  slug: string;
  category: 'Punctuation' | 'Sentence Structure' | 'Agreement' | 'Flow';
  description: string;
  /** Short concept label used to ground practice feedback, e.g. "comma splices". */
  skill: string;
};

export type QuickWritingLessonContext = {
  slug: string;
  title: string;
  skill: string;
  /** The explicit rule text from the lesson's "The Rule" section. */
  rule: string;
};

export type QuickWritingLesson = LessonMetadata & {
  title: string;
  content: string;
};

export type QuickWritingPracticePrompt = {
  id: string;
  exercise: string;
  instruction: string;
};

const LESSON_METADATA: Record<string, LessonMetadata> = {
  'Fixing Comma Splices': {
    slug: 'fixing-comma-splices',
    category: 'Punctuation',
    description: 'Recognizing and fixing comma splices',
    skill: 'comma splices',
  },
  'Revising for Wordiness': {
    slug: 'revising-for-wordiness',
    category: 'Sentence Structure',
    description: 'Cutting clutter and tightening sentences',
    skill: 'revising for wordiness',
  },
  'Transition Sentences': {
    slug: 'transition-sentences',
    category: 'Flow',
    description: 'Connecting ideas between paragraphs',
    skill: 'transition sentences',
  },
  'The Oxford Comma': {
    slug: 'the-oxford-comma',
    category: 'Punctuation',
    description: 'Using commas clearly in lists',
    skill: 'the Oxford comma',
  },
  'Commas: Sentences with Independent and Dependent Clauses': {
    slug: 'commas-independent-dependent-clauses',
    category: 'Punctuation',
    description: 'Using commas with dependent clauses',
    skill: 'commas with independent and dependent clauses',
  },
  'Passive Voice': {
    slug: 'passive-voice',
    category: 'Sentence Structure',
    description: 'Identifying and revising passive constructions',
    skill: 'passive voice',
  },
  'Parallel Construction': {
    slug: 'parallel-construction',
    category: 'Sentence Structure',
    description: 'Keeping grammatical structures consistent',
    skill: 'parallel construction',
  },
  'Subject-Verb Agreement': {
    slug: 'subject-verb-agreement',
    category: 'Agreement',
    description: 'Matching subjects and verbs correctly',
    skill: 'subject-verb agreement',
  },
  'Pronoun Agreement': {
    slug: 'pronoun-agreement',
    category: 'Agreement',
    description: 'Making pronouns clear, consistent, and inclusive',
    skill: 'pronoun agreement',
  },
  'Commas: Introductory Phrases': {
    slug: 'commas-introductory-phrases',
    category: 'Punctuation',
    description: 'Choosing commas after introductory elements',
    skill: 'commas after introductory phrases',
  },
};

const EXAMPLE_LESSON_PATTERN =
  /## Example Lesson \d+\n\n\*\*Topic:\*\* [^\n]+\n\n---\n\n([\s\S]*?)(?=\n---\n\n## Example Lesson \d+|\s*$)/g;
const PRACTICE_EXERCISE_PATTERN =
  /\*\*Exercise\s+(\d+):\*\*\n([\s\S]*?)(?=\n---\n\n\*\*Exercise\s+\d+:|\n---\s*$|\s*$)/g;

let cachedLessons: QuickWritingLesson[] | null = null;

export function getQuickWritingLessons(): QuickWritingLesson[] {
  if (!cachedLessons) {
    cachedLessons = parseArchivedLessons(promptContent);
  }

  return cachedLessons;
}

export function getQuickWritingLessonBySlug(
  slug: string | undefined
): QuickWritingLesson | null {
  if (!slug) return null;
  return (
    getQuickWritingLessons().find((lesson) => lesson.slug === slug) ?? null
  );
}

export function getQuickWritingLessonGroups() {
  const groups = new Map<
    QuickWritingLesson['category'],
    QuickWritingLesson[]
  >();

  for (const lesson of getQuickWritingLessons()) {
    const existing = groups.get(lesson.category) ?? [];
    existing.push(lesson);
    groups.set(lesson.category, existing);
  }

  return Array.from(groups, ([category, lessons]) => ({ category, lessons }));
}

/**
 * These are the ~4-6 archived exercises per lesson. Teacher-assigned practice
 * now generates a fresh, non-repeating set per student via
 * practice-prompt-generation.server (falling back to this bank when AI is
 * unavailable). TODO (remaining): give the self-serve lesson panel the same
 * AI-generated depth so drilling a skill on your own never runs dry either.
 */
export function getQuickWritingPracticePrompts(
  slug: string | undefined
): QuickWritingPracticePrompt[] {
  const lesson = getQuickWritingLessonBySlug(slug);
  if (!lesson) return [];

  return parsePracticePrompts(lesson);
}

/**
 * Returns the grounding a tutor needs to give accurate feedback on a lesson:
 * the concept label and the lesson's explicit rule text. Returns `null` for an
 * unknown slug.
 */
export function getQuickWritingLessonContext(
  slug: string | undefined
): QuickWritingLessonContext | null {
  const lesson = getQuickWritingLessonBySlug(slug);
  if (!lesson) return null;

  return {
    slug: lesson.slug,
    title: lesson.title,
    skill: lesson.skill,
    rule: extractRuleSection(lesson.content),
  };
}

function extractRuleSection(content: string): string {
  const match = content.match(/^##\s+The Rule\s*\n([\s\S]*?)(?=\n##\s|\s*$)/m);
  return (match?.[1] ?? '').trim();
}

/**
 * Returns just the teaching portion of a lesson — everything before the
 * "## Practice Time" section. Those exercises are redundant with the
 * interactive practice panel, so they should not be rendered in the lesson
 * body. Falls back to the full content if no practice section is present.
 */
export function getQuickWritingLessonBody(content: string): string {
  const index = content.search(/^##\s+Practice Time\s*$/m);
  if (index === -1) return content.trim();
  return content
    .slice(0, index)
    .replace(/\n+---\s*$/, '\n')
    .trim();
}

function parseArchivedLessons(content: string): QuickWritingLesson[] {
  const lessons: QuickWritingLesson[] = [];

  for (const match of content.matchAll(EXAMPLE_LESSON_PATTERN)) {
    const lessonMarkdown = stripTrailingRule(match[1]).trim();
    const title = lessonMarkdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (!title) continue;

    const metadata = LESSON_METADATA[title];
    if (!metadata) continue;

    lessons.push({
      ...metadata,
      title,
      content: lessonMarkdown,
    });
  }

  return lessons;
}

function stripTrailingRule(content: string) {
  return content.replace(/\n---\s*$/, '');
}

function parsePracticePrompts(
  lesson: QuickWritingLesson
): QuickWritingPracticePrompt[] {
  const prompts: QuickWritingPracticePrompt[] = [];

  for (const match of lesson.content.matchAll(PRACTICE_EXERCISE_PATTERN)) {
    const position = Number(match[1]);
    const block = match[2].trim();
    const [exerciseRaw, instructionRaw] = block.split(
      /\n\n\*\*Your turn:\*\*\s*/
    );
    const exercise = cleanPracticeText(exerciseRaw);
    const instruction = cleanPracticeText(instructionRaw ?? '');

    if (!exercise) continue;

    prompts.push({
      id: `${lesson.slug}-${position}`,
      exercise,
      instruction: instruction || 'Write your response.',
    });
  }

  return prompts;
}

function cleanPracticeText(value: string) {
  return value
    .replace(/`\[Your response here\]`/g, '')
    .replace(/\[Your response here\]/g, '')
    .replace(/^["“]|["”]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
