/**
 * What each moment of a lesson is (Kevin's stack page redesign, "Writing
 * time"): its type and color. Whether a step is writing is a separate thing,
 * set from what it is tied to in YAWP!, never by the teacher.
 */

export const STEP_TYPES = [
  'class_starter',
  'activity',
  'context',
  'read_aloud',
  'daily_pages',
  'thesis_essay',
  'closing',
] as const;

export type StepType = (typeof STEP_TYPES)[number];

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  class_starter: 'Class Starter',
  activity: 'Activity',
  context: 'Context',
  read_aloud: 'Read aloud',
  daily_pages: 'Daily Pages',
  thesis_essay: 'Thesis Essay',
  closing: 'Closing',
};

/** Tint / text / accent for each type. No type uses purple: that is writing. */
export const STEP_TYPE_COLORS: Record<StepType, { tint: string; text: string; accent: string }> = {
  class_starter: { tint: '#F3E3C8', text: '#6B4A12', accent: '#C99A3E' },
  activity: { tint: '#F8D9CC', text: '#8A3315', accent: '#D9714F' },
  context: { tint: '#DCE4F2', text: '#2B4370', accent: '#5E7DB8' },
  read_aloud: { tint: '#D5EBE5', text: '#1F5C4E', accent: '#3E9A84' },
  daily_pages: { tint: '#F6DCE6', text: '#7A2550', accent: '#C2577F' },
  thesis_essay: { tint: '#E3E9D4', text: '#3D5220', accent: '#6E8F3C' },
  closing: { tint: '#E6E2DC', text: '#45403A', accent: '#8C847A' },
};

/** Reserved for writing: the line, the badge and the meter. */
export const WRITING_COLOR = '#7B4FB0';
export const WRITING_STRIP = '#F4EEF9';

export function parseStepType(value: unknown): StepType | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((STEP_TYPES as readonly string[]).includes(normalized)) return normalized as StepType;
  if (normalized === 'starter' || normalized === 'warm_up') return 'class_starter';
  if (normalized === 'reading' || normalized === 'readaloud') return 'read_aloud';
  if (normalized === 'thesis' || normalized === 'essay') return 'thesis_essay';
  if (normalized === 'framing' || normalized === 'background') return 'context';
  return null;
}

/** Kinds that are always a YAWP! writing assignment. */
const WRITING_KINDS = new Set(['class-starter', 'daily-pages', 'exit-ticket', 'thesis-module']);

const TITLE_TYPES: [RegExp, StepType][] = [
  [/\bthesis\b/i, 'thesis_essay'],
  [/\bdaily pages\b/i, 'daily_pages'],
  [/\bclass starter\b|\bwarm[- ]?up\b|\bbell ?ringer\b|\bdo now\b/i, 'class_starter'],
  [/\bread(?:ing)?[- ]?aloud\b|\bread the\b|\breading\b/i, 'read_aloud'],
  [/\bclos(?:e|ing)\b|\bexit\b|\bwrap[- ]?up\b/i, 'closing'],
  [/\bcontext\b|\bbackground\b|\bframe\b|\bframing\b|\bthe author\b|\bhistorical\b/i, 'context'],
];

/**
 * The type of a filed piece, from what it is and then what it is called. The
 * planner's own tag (stored in `stepType`) wins over this.
 */
export function stepTypeFor({
  kind,
  title,
  stored,
}: {
  kind: string;
  title: string;
  stored?: string | null;
}): StepType {
  const tagged = parseStepType(stored);
  if (tagged) return tagged;
  switch (kind) {
    case 'class-starter':
      return 'class_starter';
    case 'daily-pages':
      return 'daily_pages';
    case 'exit-ticket':
      return 'closing';
    case 'thesis-module':
      return 'thesis_essay';
    case 'notes':
      return 'context';
  }
  for (const [pattern, type] of TITLE_TYPES) if (pattern.test(title)) return type;
  return 'activity';
}

/**
 * A step counts as writing when it is tied to a YAWP! writing assignment: by
 * its kind (class starter, Daily Pages, exit ticket, Thesis Essay module), or
 * because one was created from it. Never set by the teacher.
 */
export function isWritingStep({
  kind,
  yawpAssignmentId,
  stepType,
}: {
  kind: string;
  yawpAssignmentId?: string | null;
  stepType?: StepType | null;
}): boolean {
  if (WRITING_KINDS.has(kind)) return true;
  if (yawpAssignmentId) return true;
  // A quick write the planner tagged as Daily Pages or a Thesis Essay module
  // is a YAWP! writing assignment in waiting.
  return stepType === 'daily_pages' || stepType === 'thesis_essay';
}

/** The chip's text: the type, and its label when it has one. */
export function stepChipText(type: StepType, label?: string | null): string {
  const name = STEP_TYPE_LABELS[type];
  return label?.trim() ? `${name} · ${label.trim()}` : name;
}

/** Minutes to suggest for a step the planner gave no time. */
export const DEFAULT_STEP_MINUTES: Record<StepType, number> = {
  class_starter: 5,
  activity: 10,
  context: 5,
  read_aloud: 10,
  daily_pages: 10,
  thesis_essay: 15,
  closing: 5,
};
