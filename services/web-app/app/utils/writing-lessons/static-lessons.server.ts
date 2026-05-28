import promptContent from './prompt-content';

type LessonMetadata = {
  slug: string;
  category: 'Punctuation' | 'Sentence Structure' | 'Agreement' | 'Flow';
  description: string;
};

export type QuickWritingLesson = LessonMetadata & {
  title: string;
  content: string;
};

const LESSON_METADATA: Record<string, LessonMetadata> = {
  'Fixing Comma Splices': {
    slug: 'fixing-comma-splices',
    category: 'Punctuation',
    description: 'Recognizing and fixing comma splices',
  },
  'Revising for Wordiness': {
    slug: 'revising-for-wordiness',
    category: 'Sentence Structure',
    description: 'Cutting clutter and tightening sentences',
  },
  'Transition Sentences': {
    slug: 'transition-sentences',
    category: 'Flow',
    description: 'Connecting ideas between paragraphs',
  },
  'The Oxford Comma': {
    slug: 'the-oxford-comma',
    category: 'Punctuation',
    description: 'Using commas clearly in lists',
  },
  'Commas: Sentences with Independent and Dependent Clauses': {
    slug: 'commas-independent-dependent-clauses',
    category: 'Punctuation',
    description: 'Using commas with dependent clauses',
  },
  'Passive Voice': {
    slug: 'passive-voice',
    category: 'Sentence Structure',
    description: 'Identifying and revising passive constructions',
  },
  'Parallel Construction': {
    slug: 'parallel-construction',
    category: 'Sentence Structure',
    description: 'Keeping grammatical structures consistent',
  },
  'Subject-Verb Agreement': {
    slug: 'subject-verb-agreement',
    category: 'Agreement',
    description: 'Matching subjects and verbs correctly',
  },
  'Pronoun Agreement': {
    slug: 'pronoun-agreement',
    category: 'Agreement',
    description: 'Making pronouns clear, consistent, and inclusive',
  },
  'Commas: Introductory Phrases': {
    slug: 'commas-introductory-phrases',
    category: 'Punctuation',
    description: 'Choosing commas after introductory elements',
  },
};

const EXAMPLE_LESSON_PATTERN =
  /## Example Lesson \d+\n\n\*\*Topic:\*\* [^\n]+\n\n---\n\n([\s\S]*?)(?=\n---\n\n## Example Lesson \d+|\s*$)/g;

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
  const groups = new Map<QuickWritingLesson['category'], QuickWritingLesson[]>();

  for (const lesson of getQuickWritingLessons()) {
    const existing = groups.get(lesson.category) ?? [];
    existing.push(lesson);
    groups.set(lesson.category, existing);
  }

  return Array.from(groups, ([category, lessons]) => ({ category, lessons }));
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
