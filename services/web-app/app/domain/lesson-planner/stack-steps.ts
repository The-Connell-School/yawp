/**
 * The stack as the run of show (stack page redesign): one step per piece, in
 * the teacher's order, each with its type, minutes, whether it is writing,
 * and an excerpt. The deck is not a step: it is built from the steps
 * (Kevin's brief, data changes).
 */
import type { LessonPacket } from './lesson-packet';
import type { StackCreateLink } from './stack-create-link';
import { stackEntryKey } from './stack-order';
import { previewLine } from './plain-preview';
import { isWritingStep, STEP_TYPE_LABELS, stepTypeFor, writingName, type StepType } from './step-types';
import type { TimedStep } from './stack-timing';

export type StackStep = TimedStep & {
  /** "m:<id>" / "r:<id>", as reorder takes it. */
  key: string;
  origin: 'reply' | 'material';
  kind: string;
  label: string | null;
  hasHandout: boolean;
  excerpt: string;
  /** The rest of the step's text, for the Now card in Run the show. */
  content: string;
  create: StackCreateLink | null;
  /** The chat card this came from, "<messageId>:<blockKey>". */
  token: string | null;
};

type Meta = {
  stepType: string | null;
  label: string | null;
  minutes: number | null;
  hasHandout: boolean | null;
  yawpAssignmentId: string | null;
  yawpCreated: boolean;
};

const STUDENT_KINDS = new Set(['class-starter', 'daily-pages', 'exit-ticket', 'handout', 'sample']);
const TITLE_MINUTES = /\s*\(\s*\d+[^)]*min[^)]*\)\s*$/i;
// The type chip already says what it is; the title says which one.
const TYPE_PREFIX = /^(?:Class Starter|Daily Pages|Exit ticket|Writing practice)\s*:\s*/i;

function excerptOf(markdown: string): string {
  // Clean words, never raw marks (Kevin, Oct 25, note 7).
  return previewLine(markdown, 240);
}

export function stackSteps({
  packet,
  materialKinds,
  materialMeta,
  materialTokens,
  stackDetails,
}: {
  packet: Pick<LessonPacket, 'sections' | 'outline'>;
  materialKinds: Record<string, string>;
  materialMeta: Record<string, Meta>;
  materialTokens: Record<string, string>;
  stackDetails: Record<string, { create: StackCreateLink | null }>;
}): StackStep[] {
  const outline = new Map(packet.outline.map((entry) => [entry.anchor, entry]));
  return packet.sections.flatMap((section): StackStep[] => {
    const kind =
      section.origin === 'material' ? (materialKinds[section.id] ?? 'notes') : 'lesson';
    if (kind === 'slides' || section.deck) return [];
    const meta = materialMeta[section.id];
    const title = section.title.replace(TITLE_MINUTES, '').trim().replace(TYPE_PREFIX, '') || section.title;
    const type = stepTypeFor({ kind, title, stored: meta?.stepType ?? null });
    const entry = outline.get(section.anchor);
    // Planned minutes only; a suggested time is the timing's to fill in.
    const minutes = meta?.minutes ?? (entry && !entry.suggested ? entry.minutes : null);
    const isWriting = isWritingStep({
      kind,
      stepType: type,
      title,
      content: section.content,
      yawpAssignmentId: meta?.yawpAssignmentId ?? (meta?.yawpCreated ? 'created' : null),
    });
    return [
      {
        key: stackEntryKey(section),
        id: section.id,
        origin: section.origin,
        kind,
        title,
        type,
        label: meta?.label ?? null,
        minutes,
        isWriting,
        writingName: isWriting ? writingName({ kind, stepType: type, title, content: section.content }) : undefined,
        hasHandout:
          meta?.hasHandout ?? (STUDENT_KINDS.has(kind) || section.audience === 'student' || isWriting),
        excerpt: excerptOf(section.content),
        content: section.content,
        create: stackDetails[section.id]?.create ?? null,
        token: materialTokens[section.id] ?? null,
      },
    ];
  });
}

export type { StepType };

/**
 * The writing steps whose Yawp! assignment has not been made yet, in order,
 * less the ones the teacher is running on paper. A teacher can be offered
 * Yawp! for an exit ticket and choose paper; what they should never do is
 * reach class thinking it exists when it does not.
 */
export function notYetInYawp<T extends Pick<StackStep, 'id' | 'create'>>(steps: T[], onPaper: ReadonlySet<string> = new Set()): T[] {
  return steps.filter((step) => step.create && !step.create.created && !onPaper.has(step.id));
}

/**
 * What a step is called wherever the lesson is shown to someone else (Brian's
 * round 5, item 7): the name on the stack. Writing goes by its type ("Class
 * Starter", "Exit Ticket"); anything else by its label ("Class Discussion"),
 * then its type ("Read aloud").
 */
export function stackStepName(step: Pick<StackStep, 'type' | 'label' | 'isWriting' | 'writingName'>): string {
  if (step.isWriting && step.writingName) return step.writingName;
  return step.label?.trim() || STEP_TYPE_LABELS[step.type];
}

/** Kinds that are always a Yawp! assignment. */
const ASSIGNMENT_KINDS = new Set(['class-starter', 'daily-pages', 'exit-ticket', 'thesis-module']);

/**
 * Whether a step is writing students do in Yawp! (Brian's round 5, items
 * 7–10): a writing step that is an assignment kind, has a Yawp! create link,
 * or was made in Yawp!. A handout to fill in on paper is writing, not this.
 */
export function isYawpAssignmentStep(
  step: Pick<StackStep, 'kind' | 'isWriting' | 'create'>,
  made = false
): boolean {
  if (!step.isWriting) return false;
  return made || Boolean(step.create) || ASSIGNMENT_KINDS.has(step.kind);
}
