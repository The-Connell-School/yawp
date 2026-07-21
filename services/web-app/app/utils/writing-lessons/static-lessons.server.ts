import promptContent from './prompt-content';

/**
 * The two top-level strands of Writing Fundamentals Practice. Grammar &
 * Mechanics is the original ACT-English-style multiple-choice work; Composition
 * is constructed-response practice (topic sentences, thesis statements, and —
 * later — evidence and analysis) graded by the tutor feedback service.
 */
export type LessonSection = 'Grammar & Mechanics' | 'Composition';

export type LessonCategory =
  | 'Punctuation'
  | 'Sentence Structure'
  | 'Agreement'
  | 'Flow'
  | 'Making Claims'
  | 'Supporting Claims'
  | 'Framing the Essay';

type LessonMetadata = {
  slug: string;
  section: LessonSection;
  category: LessonCategory;
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
    section: 'Grammar & Mechanics',
    slug: 'fixing-comma-splices',
    category: 'Punctuation',
    description: 'Recognizing and fixing comma splices',
    skill: 'comma splices',
  },
  'Revising for Wordiness': {
    section: 'Grammar & Mechanics',
    slug: 'revising-for-wordiness',
    category: 'Sentence Structure',
    description: 'Cutting clutter and tightening sentences',
    skill: 'revising for wordiness',
  },
  'Transition Sentences': {
    section: 'Grammar & Mechanics',
    slug: 'transition-sentences',
    category: 'Flow',
    description: 'Connecting ideas between paragraphs',
    skill: 'transition sentences',
  },
  'The Oxford Comma': {
    section: 'Grammar & Mechanics',
    slug: 'the-oxford-comma',
    category: 'Punctuation',
    description: 'Using commas clearly in lists',
    skill: 'the Oxford comma',
  },
  'Commas: Sentences with Independent and Dependent Clauses': {
    section: 'Grammar & Mechanics',
    slug: 'commas-independent-dependent-clauses',
    category: 'Punctuation',
    description: 'Using commas with dependent clauses',
    skill: 'commas with independent and dependent clauses',
  },
  'Passive Voice': {
    section: 'Grammar & Mechanics',
    slug: 'passive-voice',
    category: 'Sentence Structure',
    description: 'Identifying and revising passive constructions',
    skill: 'passive voice',
  },
  'Parallel Construction': {
    section: 'Grammar & Mechanics',
    slug: 'parallel-construction',
    category: 'Sentence Structure',
    description: 'Keeping grammatical structures consistent',
    skill: 'parallel construction',
  },
  'Subject-Verb Agreement': {
    section: 'Grammar & Mechanics',
    slug: 'subject-verb-agreement',
    category: 'Agreement',
    description: 'Matching subjects and verbs correctly',
    skill: 'subject-verb agreement',
  },
  'Pronoun Agreement': {
    section: 'Grammar & Mechanics',
    slug: 'pronoun-agreement',
    category: 'Agreement',
    description: 'Making pronouns clear, consistent, and inclusive',
    skill: 'pronoun agreement',
  },
  'Commas: Introductory Phrases': {
    section: 'Grammar & Mechanics',
    slug: 'commas-introductory-phrases',
    category: 'Punctuation',
    description: 'Choosing commas after introductory elements',
    skill: 'commas after introductory phrases',
  },
  'Topic Sentences': {
    section: 'Composition',
    slug: 'topic-sentences',
    category: 'Making Claims',
    description: 'Opening a paragraph with an arguable claim',
    skill: 'topic sentences',
  },
  'Thesis Statements': {
    section: 'Composition',
    slug: 'thesis-statements',
    category: 'Making Claims',
    description: 'Stating the one arguable claim an essay defends',
    skill: 'thesis statements',
  },
  Evidence: {
    section: 'Composition',
    slug: 'evidence',
    category: 'Supporting Claims',
    description: 'Backing a claim with specific, relevant support',
    skill: 'evidence',
  },
  Analysis: {
    section: 'Composition',
    slug: 'analysis',
    category: 'Supporting Claims',
    description: 'Explaining how evidence proves the claim',
    skill: 'analysis',
  },
  'Hooks & Openings': {
    section: 'Composition',
    slug: 'hooks-and-openings',
    category: 'Framing the Essay',
    description: 'Opening an essay so readers want to keep going',
    skill: 'essay hooks and openings',
  },
  Conclusions: {
    section: 'Composition',
    slug: 'conclusions',
    category: 'Framing the Essay',
    description: 'Ending with more than a restated thesis',
    skill: 'essay conclusions',
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
  return groupByCategory(getQuickWritingLessons());
}

const SECTION_ORDER: LessonSection[] = ['Grammar & Mechanics', 'Composition'];

/**
 * Lessons grouped by their top-level section (Grammar & Mechanics, then
 * Composition), and within each section by category — the shape the lessons
 * index renders. Sections follow {@link SECTION_ORDER}; categories keep their
 * first-appearance order within a section.
 */
export function getQuickWritingLessonSections(): Array<{
  section: LessonSection;
  groups: ReturnType<typeof groupByCategory>;
}> {
  const bySection = new Map<LessonSection, QuickWritingLesson[]>();

  for (const lesson of getQuickWritingLessons()) {
    const existing = bySection.get(lesson.section) ?? [];
    existing.push(lesson);
    bySection.set(lesson.section, existing);
  }

  return SECTION_ORDER.filter((section) => bySection.has(section)).map(
    (section) => ({
      section,
      groups: groupByCategory(bySection.get(section) ?? []),
    })
  );
}

function groupByCategory(lessons: QuickWritingLesson[]) {
  const groups = new Map<LessonCategory, QuickWritingLesson[]>();

  for (const lesson of lessons) {
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
