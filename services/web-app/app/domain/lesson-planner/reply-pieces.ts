/**
 * Everything a reply hands over, as the keys the packet API files them by, in
 * the order the reply has them (Brian's run 2, A4: "add everything, then
 * refine in the stack").
 *
 * Steps come from the plan's headings; each block inside a step (a framing,
 * a class starter, an exit ticket) is a piece of its own and follows the step
 * it sits in. Keys are numbered exactly as `artifactFromAssistantReply` reads
 * them, so filing by key finds the same piece.
 */
import { readLessonMaterials } from './lesson-material';
import { readDailyPagesExercises, dailyPagesBlockKey } from './daily-pages-block';
import { readPlannedExitTickets } from './exit-ticket-block';
import { EXIT_TICKET_BLOCK_KEY, DECK_SLOT, deckAsMaterial } from './lesson-material';
import { readPlanSteps } from './plan-steps';

const FILEABLE_BLOCK =
  /```+(yawp-material|yawp-daily-pages|yawp-exit-ticket|yawp-slides)[^\n]*\n[\s\S]*?```+/g;

export function pieceKeysInReply(content: string): string[] {
  const placed: Array<{ at: number; order: number; key: string }> = [];
  for (const step of readPlanSteps(content)) {
    // A step that is nothing but its block ("## Class starter" over the
    // prompt) is that block; filing an empty step beside it says nothing.
    if (step.content.trim()) placed.push({ at: step.at, order: 0, key: step.key });
  }

  let materials = 0;
  let exercises = 0;
  let tickets = 0;
  let deckFiled = false;
  for (const match of content.matchAll(FILEABLE_BLOCK)) {
    const at = match.index ?? 0;
    const block = match[0];
    const push = (key: string, order: number) => placed.push({ at, order, key });
    if (match[1] === 'yawp-material') {
      if (readLessonMaterials(block).materials.length) push(String(materials++), 1);
    } else if (match[1] === 'yawp-daily-pages') {
      readDailyPagesExercises(block).exercises.forEach((_, index) =>
        push(dailyPagesBlockKey(exercises++), 1 + index / 100)
      );
    } else if (match[1] === 'yawp-exit-ticket') {
      if (readPlannedExitTickets(block).tickets.length) {
        push(tickets === 0 ? EXIT_TICKET_BLOCK_KEY : `${EXIT_TICKET_BLOCK_KEY}:${tickets}`, 1);
        tickets += 1;
      }
    } else if (!deckFiled && deckAsMaterial(content)) {
      // A lesson has one deck: the reply's first.
      push(DECK_SLOT, 1);
      deckFiled = true;
    }
  }

  return placed.sort((a, b) => a.at - b.at || a.order - b.order).map((piece) => piece.key);
}
