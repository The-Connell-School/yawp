/**
 * A piece of a reply, ready to file in the stack with its minutes and type
 * (Brian's run 3, item 9: "Suggest a time for everything").
 *
 * Every way into the stack (one Add, Add everything, Replace) files through
 * here, so a piece gets the same minutes however it got in: its own
 * `minutes:`, else the step it stands for ("## Exit ticket (10 min)" holding
 * only the ticket), else none, and the stack suggests its type's default.
 */
import { artifactFromAssistantReply } from './artifact-from-reply';
import type { LessonMaterial } from './lesson-material';
import { blockMinutesInReply } from './reply-pieces';
import { parseStepType } from './step-types';

const TITLE_MINUTES = /\(\s*\d+[^)]*min/i;

export function fileableMaterial(content: string, key: string): LessonMaterial | null {
  const found = artifactFromAssistantReply(content, key);
  if (!found) return null;
  const minutes = found.minutes ?? blockMinutesInReply(content)[key] ?? null;
  return {
    ...found,
    // The title keeps "(N min)" too, while the old stack page still reads
    // minutes out of titles (dual-write).
    title:
      minutes != null && !TITLE_MINUTES.test(found.title)
        ? `${found.title} (${minutes} min)`
        : found.title,
    minutes,
  };
}

/** The new step columns for a filed piece. */
export function stepColumns(material: LessonMaterial): {
  minutes: number | null;
  stepType: string | null;
} {
  return {
    minutes: material.minutes ?? null,
    stepType: parseStepType(material.stepType) ?? null,
  };
}
