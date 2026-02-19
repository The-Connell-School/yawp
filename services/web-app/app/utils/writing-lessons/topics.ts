/**
 * Critical Writing Lessons - Topic Definitions
 *
 * These 10 topics form the core of the YAWP! Quick Writing Lessons feature.
 * Each topic has a complete mini-lesson with hook, explanation, examples,
 * quick tip, and practice exercises (see prompt.md for full lesson content).
 */

export const WRITING_LESSON_TOPICS = {
  WORDINESS: {
    key: 'WORDINESS',
    name: 'Revising for Wordiness',
    description: 'Cutting clutter, tightening sentences',
    category: 'Sentence Structure',
    lessonComplete: true,
  },
  TRANSITIONS: {
    key: 'TRANSITIONS',
    name: 'Transition Sentences',
    description: 'Connecting ideas between paragraphs',
    category: 'Flow',
    lessonComplete: true,
  },
  COMMA_OXFORD: {
    key: 'COMMA_OXFORD',
    name: 'Comma: Oxford/Serial',
    description: 'When and why to use the serial comma',
    category: 'Punctuation',
    lessonComplete: true,
  },
  COMMA_SPLICES: {
    key: 'COMMA_SPLICES',
    name: 'Comma: Splices',
    description: 'Recognizing and fixing comma splices',
    category: 'Punctuation',
    lessonComplete: true,
  },
  COMMA_INTRODUCTORY: {
    key: 'COMMA_INTRODUCTORY',
    name: 'Comma: Introductory Phrases',
    description: 'Comma after introductory elements',
    category: 'Punctuation',
    lessonComplete: true,
  },
  COMMA_CLAUSES: {
    key: 'COMMA_CLAUSES',
    name: 'Comma: Independent & Dependent Clauses',
    description: 'When to use commas with dependent clauses',
    category: 'Punctuation',
    lessonComplete: true,
  },
  PASSIVE_VOICE: {
    key: 'PASSIVE_VOICE',
    name: 'Passive Voice',
    description: 'Identifying and revising passive constructions',
    category: 'Sentence Structure',
    lessonComplete: true,
  },
  PARALLEL_CONSTRUCTION: {
    key: 'PARALLEL_CONSTRUCTION',
    name: 'Parallel Construction',
    description: 'Maintaining grammatical consistency in lists/series',
    category: 'Sentence Structure',
    lessonComplete: true,
  },
  SUBJECT_VERB_AGREEMENT: {
    key: 'SUBJECT_VERB_AGREEMENT',
    name: 'Subject-Verb Agreement',
    description: 'Matching subjects and verbs correctly',
    category: 'Agreement',
    lessonComplete: true,
  },
  PRONOUN_AGREEMENT: {
    key: 'PRONOUN_AGREEMENT',
    name: 'Pronoun Agreement',
    description: 'Ensuring pronouns match their antecedents',
    category: 'Agreement',
    lessonComplete: true,
  },
} as const;

export type WritingLessonTopicKey = keyof typeof WRITING_LESSON_TOPICS;

export const WRITING_LESSON_CATEGORIES = [
  'Punctuation',
  'Sentence Structure',
  'Agreement',
  'Flow',
] as const;

export type WritingLessonCategory = (typeof WRITING_LESSON_CATEGORIES)[number];

export const GRADE_LEVELS = [
  { value: 'middle-school', label: 'Middle School' },
  { value: 'high-school', label: 'High School' },
  { value: 'college', label: 'College' },
] as const;

/**
 * Get all topics for a given category
 */
export function getTopicsByCategory(category: WritingLessonCategory) {
  return Object.values(WRITING_LESSON_TOPICS).filter(
    (topic) => topic.category === category
  );
}

/**
 * Get all topics grouped by category
 */
export function getTopicsGroupedByCategory() {
  return WRITING_LESSON_CATEGORIES.map((category) => ({
    category,
    topics: getTopicsByCategory(category),
  }));
}
