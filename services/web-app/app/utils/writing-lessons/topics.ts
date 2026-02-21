import { WritingLessonTopic } from '@app/prisma';

export interface TopicInfo {
  name: string;
  description: string;
  category: 'punctuation' | 'sentence-structure' | 'agreement' | 'flow';
  icon: string; // Lucide icon name
}

export const WRITING_LESSON_TOPICS: Record<WritingLessonTopic, TopicInfo> = {
  [WritingLessonTopic.WORDINESS]: {
    name: 'Revising for Wordiness',
    description: 'Cutting clutter, tightening sentences',
    category: 'sentence-structure',
    icon: 'Scissors',
  },
  [WritingLessonTopic.TRANSITIONS]: {
    name: 'Transition Sentences',
    description: 'Connecting ideas between paragraphs',
    category: 'flow',
    icon: 'ArrowRight',
  },
  [WritingLessonTopic.COMMA_OXFORD]: {
    name: 'Oxford Comma',
    description: 'Using commas in lists',
    category: 'punctuation',
    icon: 'List',
  },
  [WritingLessonTopic.COMMA_SPLICES]: {
    name: 'Comma Splices',
    description: 'Fixing run-on sentences',
    category: 'punctuation',
    icon: 'Split',
  },
  [WritingLessonTopic.COMMA_INTRODUCTORY]: {
    name: 'Introductory Commas',
    description: 'Commas after introductory elements',
    category: 'punctuation',
    icon: 'ChevronRight',
  },
  [WritingLessonTopic.COMMA_CLAUSES]: {
    name: 'Commas with Clauses',
    description: 'Essential vs. non-essential clauses',
    category: 'punctuation',
    icon: 'Brackets',
  },
  [WritingLessonTopic.PASSIVE_VOICE]: {
    name: 'Passive Voice',
    description: 'Converting to active voice',
    category: 'sentence-structure',
    icon: 'Shuffle',
  },
  [WritingLessonTopic.PARALLEL_CONSTRUCTION]: {
    name: 'Parallel Construction',
    description: 'Keeping structures consistent',
    category: 'sentence-structure',
    icon: 'Columns',
  },
  [WritingLessonTopic.SUBJECT_VERB_AGREEMENT]: {
    name: 'Subject-Verb Agreement',
    description: 'Matching subjects with verbs',
    category: 'agreement',
    icon: 'Link',
  },
  [WritingLessonTopic.PRONOUN_AGREEMENT]: {
    name: 'Pronoun Agreement',
    description: 'Matching pronouns with antecedents',
    category: 'agreement',
    icon: 'Users',
  },
};

export const CATEGORY_LABELS: Record<TopicInfo['category'], string> = {
  punctuation: 'Punctuation',
  'sentence-structure': 'Sentence Structure',
  agreement: 'Agreement',
  flow: 'Flow',
};

export const GRADE_LEVELS = [
  { value: 'middle-school', label: 'Middle School' },
  { value: 'high-school', label: 'High School' },
  { value: 'college', label: 'College' },
] as const;

export type GradeLevel = (typeof GRADE_LEVELS)[number]['value'];

// Exercise structure
export interface Exercise {
  prompt: string; // The sentence/text to work with
  instruction: string; // What to do with it
  expectedFix?: string; // Optional: what the corrected version should be (for exact matching)
}

// Parsed lesson content structure
export interface ParsedLesson {
  hook: string;
  rule: string;
  examples: Array<{
    before: string;
    after: string;
    explanation?: string;
  }>;
  tip: string;
  exercises: Exercise[];
}
