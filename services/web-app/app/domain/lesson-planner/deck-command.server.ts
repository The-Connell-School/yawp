/**
 * Ask Yawp! in the deck studio (Nov 19): one line in, the deck in the editor
 * changed, one short answer out. One model call on the planner's own budget
 * and model (`plannerComplete`), with only metadata in the logs.
 *
 * Nothing is written here. The page puts the returned deck in the editor and
 * the teacher saves it as they save anything typed on a slide, so a change
 * they do not want never reaches the lesson, and the lesson's own chat (which
 * the planner replays in full) never sees these lines.
 */
import { buildDeckKitV4Section } from '~/routes/api.domain.lesson-planner/build-system-prompt';
import {
  applyDeckOps,
  deckCommandSystem,
  deckCommandUserMessage,
  readDeckCommandResult,
  type DeckChange,
  type DeckSelection,
} from './deck-command';
import { plannerComplete, type PlannerAccess } from './planner-completion.server';
import type { SlideDeck } from './slide-deck';

export type DeckCommandOutcome = {
  reply: string;
  /** True when the deck changed: `deck` is the one to show. */
  applied: boolean;
  deck?: SlideDeck;
  changes: DeckChange[];
};

const COULD_NOT = 'I couldn’t make that change. Try saying it another way, or change it on the slide.';

export async function runDeckCommand({
  request,
  access,
  deck,
  line,
  selection,
  periodMinutes,
  complete = plannerComplete,
}: {
  request: Request;
  access: PlannerAccess;
  /** The deck in the editor, with the look it is drawn in (`kit`). */
  deck: SlideDeck;
  line: string;
  selection: DeckSelection | null;
  periodMinutes: number | null;
  /** The model call; replaceable in tests. */
  complete?: typeof plannerComplete;
}): Promise<DeckCommandOutcome> {
  // The writing rules of the spec this school's decks are drawn in.
  const kitRules = deck.kit ? buildDeckKitV4Section([], { v41: deck.kit === 'v4.1' }).join('\n').trim() : null;
  // A rate limit or a locked account is the route's to answer; anything else
  // the model does wrong is "couldn't make that change".
  const answer = await complete({
    request,
    access,
    system: deckCommandSystem({ kitRules }),
    user: deckCommandUserMessage({ deck, line, periodMinutes, selection }),
    feature: 'lesson-planner-deck-command',
    route: 'routes/api.domain.lesson-planner.deck-command',
    maxTokens: 6_000,
    deadlineMs: 60_000,
  });
  const result = readDeckCommandResult(answer);
  if (!result) return { reply: COULD_NOT, applied: false, changes: [] };
  if (!result.ops.length) return { reply: result.reply, applied: false, changes: [] };

  const outcome = applyDeckOps(deck, result.ops);
  if (!outcome.ok || !outcome.changes.length) return { reply: outcome.ok ? result.reply : COULD_NOT, applied: false, changes: [] };
  return { reply: result.reply, applied: true, deck: outcome.deck, changes: outcome.changes };
}
