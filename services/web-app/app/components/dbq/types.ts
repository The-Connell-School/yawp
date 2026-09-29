export type EssayType = 'dbq' | 'leq';

export type DbqSource = {
  id: string;
  label: string;
  title: string;
  attribution: string;
  body: string;
  caption?: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
};

export type DbqPrompt = {
  id: string;
  title: string;
  essayType: EssayType;
  period: 'ap-ush' | 'ap-euro' | 'ap-world';
  era: string[];
  reasoningSkill:
    | 'causation'
    | 'comparison'
    | 'continuity-and-change'
    | 'periodization';
  dateWindow: { from: number; to: number };
  prompt: string;
  sources: DbqSource[];
};

export type TimeMode = 'untimed' | 'timed';

export type View = 'drafting' | 'submitted';

export type DraftingPhase =
  | 'source-analysis'
  | 'thesis'
  | 'contextualization'
  | 'drafting'
  | 'revision';

export const DBQ_PHASES: { id: DraftingPhase; label: string }[] = [
  { id: 'source-analysis', label: 'Source analysis' },
  { id: 'thesis', label: 'Thesis' },
  { id: 'contextualization', label: 'Contextualization' },
  { id: 'drafting', label: 'Drafting' },
  { id: 'revision', label: 'Revision' },
];

export type PlanningState = {
  outline: string;
  thesisDraft: string;
  docGroupings: string;
  outsideEvidence: string;
};

export const emptyPlanning: PlanningState = {
  outline: '',
  thesisDraft: '',
  docGroupings: '',
  outsideEvidence: '',
};

export type SourceAnnotation = {
  id: string;
  sourceId: string;
  text: string;
  createdAt: number;
};

export type MarkKind = 'highlight' | 'underline';

export type TextMark = {
  id: string;
  sourceId: string;
  kind: MarkKind;
  // Character offsets into the source body, [start, end).
  start: number;
  end: number;
  // The selected text, kept for display in the notes list and resilience.
  quote: string;
  // Optional comment attached to this mark.
  note: string;
  createdAt: number;
};

export type TextSegment = {
  start: number;
  end: number;
  markIds: string[];
  kinds: MarkKind[];
};

export type FailureFlag = {
  id: string;
  label: string;
  detail: string;
};

export type ChatRole = 'tutor' | 'student';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  body: string;
  createdAt: number;
  // If the message came from a deterministic source we want to dedupe.
  origin?: 'seed' | 'phase' | 'detector' | 'reply';
  detectorId?: string;
};
