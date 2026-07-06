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
};

export type ApPrompt = {
  externalKey: string;
  title: string;
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
  essayType: 'essayType',
  reasoningSkill: 'reasoningSkill',
  difficulty: 'difficulty',
} as const;

export const ESSAY_TYPE_LABEL: Record<string, string> = {
  dbq: 'DBQ',
  leq: 'LEQ',
};

export const PERIOD_LABEL: Record<string, string> = {
  ush: 'AP U.S. History',
  eur: 'AP European History',
  wld: 'AP World History',
};

export const REASONING_SKILL_LABEL: Record<string, string> = {
  causation: 'Causation',
  comparison: 'Comparison',
  ccot: 'Continuity & Change',
  periodization: 'Periodization',
};

export const DIFFICULTY_LABEL: Record<string, string> = {
  intro: 'Intro',
  'mid-year': 'Mid-Year',
  'exam-ready': 'Exam-Ready',
};

export const APUSH_PERIOD_LABEL: Record<number, string> = {
  2: 'Period 2: 1607–1754',
  3: 'Period 3: 1754–1800',
  4: 'Period 4: 1800–1848',
  5: 'Period 5: 1844–1877',
  6: 'Period 6: 1865–1898',
  7: 'Period 7: 1890–1945',
  8: 'Period 8: 1945–1980',
};
