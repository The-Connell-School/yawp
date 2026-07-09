export type ApPromptSource = {
  externalKey: string;
  title: string;
  attribution: string;
  body: string;
  position: number;
  caption?: string | null;
  mediaType?: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  provenanceUrl?: string | null;
};

export type ApPrompt = {
  externalKey: string;
  title: string;
  course: string;
  essayType: string;
  period: string;
  periodNumber: number;
  reasoningSkill: string;
  difficulty: string | null;
  prompt: string;
  sources: ApPromptSource[];
};

export const AP_FACET_KEYS = {
  search: 'q',
  course: 'course',
  essayType: 'essayType',
  reasoningSkill: 'reasoningSkill',
  difficulty: 'difficulty',
} as const;

export const ESSAY_TYPE_LABEL: Record<string, string> = {
  dbq: 'DBQ',
  leq: 'LEQ',
};

// Canonical AP history courses. The library only carries US History prompts
// today, but the course facet always offers all three so teachers can filter
// (and see what is coming) before Euro and World prompts are added.
export const COURSE_LABEL: Record<string, string> = {
  apush: 'AP U.S. History',
  euro: 'AP European History',
  world: 'AP World History',
};

export const COURSE_ORDER = ['apush', 'euro', 'world'] as const;

export const REASONING_SKILL_LABEL: Record<string, string> = {
  causation: 'Causation',
  comparison: 'Comparison',
  'continuity-and-change': 'Continuity & Change',
  ccot: 'Continuity & Change',
  periodization: 'Periodization',
};

// Difficulty describes where in the school year a prompt fits. All three
// buckets are always offered as filter options, in this order.
export const DIFFICULTY_LABEL: Record<string, string> = {
  intro: 'Beginning of year',
  'mid-year': 'Mid-year',
  'exam-ready': 'Exam-ready',
};

export const DIFFICULTY_ORDER = ['intro', 'mid-year', 'exam-ready'] as const;

export const APUSH_PERIOD_LABEL: Record<number, string> = {
  2: 'Period 2: 1607–1754',
  3: 'Period 3: 1754–1800',
  4: 'Period 4: 1800–1848',
  5: 'Period 5: 1844–1877',
  6: 'Period 6: 1865–1898',
  7: 'Period 7: 1890–1945',
  8: 'Period 8: 1945–1980',
};
