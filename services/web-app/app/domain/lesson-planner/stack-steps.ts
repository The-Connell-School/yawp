/**
 * The stack as the run of show (stack page redesign): one step per piece, in
 * the teacher's order, each with its type, minutes, whether it is writing,
 * and an excerpt. The deck is not a step: it is built from the steps
 * (Kevin's brief, data changes).
 */
import type { LessonPacket } from './lesson-packet';
import type { StackCreateLink } from './stack-create-link';
import { stackEntryKey } from './stack-order';
import { isWritingStep, stepTypeFor, type StepType } from './step-types';
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
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/[*_`>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= 240) return text;
  const cut = text.slice(0, 240);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trim()}…`;
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
