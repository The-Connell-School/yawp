// Mock data for the AP History Essay prompt library and create-assignment
// sheet. Mirrors the LibraryPrompt shape called out in the v1 spec
// (docs/plans/2026-05-09-ap-history-essay-spec-v1.md).

export type EssayType = 'DBQ' | 'LEQ';
export type Period = 'AP USH' | 'AP Euro' | 'AP World';
export type Reasoning =
  | 'causation'
  | 'comparison'
  | 'continuity-and-change'
  | 'periodization';
export type Difficulty = 'intro' | 'mid-year' | 'exam-ready';

export type LibraryPrompt = {
  id: string;
  type: EssayType;
  period: Period;
  prompt: string;
  era: string;
  sourceCount: number | null;
  reasoning: Reasoning;
  skillEmphasis: string[];
  difficulty: Difficulty;
};

export const REASONING_LABEL: Record<Reasoning, string> = {
  causation: 'Causation',
  comparison: 'Comparison',
  'continuity-and-change': 'Continuity & change',
  periodization: 'Periodization',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  intro: 'Intro',
  'mid-year': 'Mid-year',
  'exam-ready': 'Exam-ready',
};

export const SAMPLE_PROMPTS: LibraryPrompt[] = [
  {
    id: 'DBQ-USH-001',
    type: 'DBQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the Reconstruction era (1865–1877) marked a turning point in the lives of formerly enslaved people.',
    era: 'Reconstruction',
    sourceCount: 7,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['sourcing-heavy', 'complexity-heavy'],
    difficulty: 'mid-year',
  },
  {
    id: 'DBQ-USH-002',
    type: 'DBQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the Progressive Era reforms (1890–1920) addressed the problems of industrialization.',
    era: 'Progressive Era',
    sourceCount: 7,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['balanced'],
    difficulty: 'mid-year',
  },
  {
    id: 'DBQ-USH-003',
    type: 'DBQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the Cold War shaped American domestic policy from 1945 to 1975.',
    era: 'Cold War',
    sourceCount: 6,
    reasoning: 'causation',
    skillEmphasis: ['contextualization-heavy'],
    difficulty: 'exam-ready',
  },
  {
    id: 'LEQ-USH-001',
    type: 'LEQ',
    period: 'AP USH',
    prompt:
      'Evaluate the relative importance of causes of the American Civil War.',
    era: 'Antebellum',
    sourceCount: null,
    reasoning: 'causation',
    skillEmphasis: ['outside-evidence-heavy'],
    difficulty: 'mid-year',
  },
  {
    id: 'LEQ-USH-002',
    type: 'LEQ',
    period: 'AP USH',
    prompt:
      'Compare the goals and outcomes of Reconstruction policies in the 1860s and 1870s.',
    era: 'Reconstruction',
    sourceCount: null,
    reasoning: 'comparison',
    skillEmphasis: ['balanced'],
    difficulty: 'mid-year',
  },
  {
    id: 'LEQ-USH-003',
    type: 'LEQ',
    period: 'AP USH',
    prompt:
      'Evaluate the extent to which the period from 1945 to 1980 represents a continuation of New Deal liberalism.',
    era: 'Postwar & Civil Rights',
    sourceCount: null,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['complexity-heavy'],
    difficulty: 'exam-ready',
  },
  {
    id: 'DBQ-EUR-001',
    type: 'DBQ',
    period: 'AP Euro',
    prompt:
      'Evaluate the extent to which the Reformation transformed European political authority in the 16th century.',
    era: 'Reformation',
    sourceCount: 7,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['complexity-heavy'],
    difficulty: 'mid-year',
  },
  {
    id: 'LEQ-EUR-001',
    type: 'LEQ',
    period: 'AP Euro',
    prompt: 'Compare the responses of European states to the French Revolution.',
    era: 'French Revolution',
    sourceCount: null,
    reasoning: 'comparison',
    skillEmphasis: ['balanced'],
    difficulty: 'mid-year',
  },
  {
    id: 'DBQ-WLD-001',
    type: 'DBQ',
    period: 'AP World',
    prompt:
      'Evaluate the extent to which trans-Saharan trade networks transformed West African societies between 1000 and 1450.',
    era: 'Post-Classical',
    sourceCount: 5,
    reasoning: 'continuity-and-change',
    skillEmphasis: ['contextualization-heavy'],
    difficulty: 'intro',
  },
  {
    id: 'LEQ-WLD-001',
    type: 'LEQ',
    period: 'AP World',
    prompt:
      'Evaluate the relative importance of factors that drove industrialization between 1750 and 1900.',
    era: 'Industrial',
    sourceCount: null,
    reasoning: 'causation',
    skillEmphasis: ['outside-evidence-heavy'],
    difficulty: 'exam-ready',
  },
];

export const INSPIRATIONAL_EXAMPLES: Array<{
  type: EssayType;
  title: string;
  blurb: string;
}> = [
  {
    type: 'DBQ',
    title: 'Reconstruction as a turning point',
    blurb:
      '7-source DBQ pushing students to argue continuity vs. change in the lives of formerly enslaved people, 1865–1877.',
  },
  {
    type: 'LEQ',
    title: 'Causes of the Civil War',
    blurb:
      'Causation LEQ — students rely entirely on outside evidence to weigh the relative importance of antebellum causes.',
  },
  {
    type: 'DBQ',
    title: 'Cold War & domestic policy',
    blurb:
      '6-source DBQ tuned for contextualization. Strong fit for late-year exam-prep practice.',
  },
];

// Mock teacher classes for the create-assignment sheet preview.
export const MOCK_TEACHER_CLASSES: Array<{ id: string; label: string }> = [
  { id: 'mock-class-apush-3', label: 'APUSH · Period 3' },
  { id: 'mock-class-apush-4', label: 'APUSH · Period 4' },
  { id: 'mock-class-apush-6', label: 'APUSH · Period 6' },
];

export function suggestedAssignmentTitle(p: LibraryPrompt): string {
  return `${p.era} ${p.type}`;
}
