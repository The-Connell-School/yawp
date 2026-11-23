/**
 * The agenda slide keeps the stack's times (Brian's round 3, 1.4).
 *
 * "Today's program" carries the minutes the planner wrote when it built the
 * deck. Once the teacher steps a time on the stack (16 to 15, 8 to 10), the
 * slide said one thing and the stack another. The deck is never rewritten
 * for it: whoever reads the deck (Present, PowerPoint, the PDFs, the share
 * pages) reads its agenda through this, so the teacher's deck and any hand
 * edit stay as they were and every view agrees with the stack.
 */
import type { SlideDeck } from './slide-deck';
import { STEP_TYPE_LABELS, type StepType } from './step-types';

export type AgendaStep = { title: string; type: StepType; minutes: number };

const STOP = new Set([
  'the', 'and', 'who', 'why', 'how', 'what', 'does', 'did', 'here', 'with', 'for', 'from', 'this', 'that',
  'your', 'our', 'his', 'her', 'its', 'are', 'was', 'into', 'about', 'matter', 'matters', 'them', 'they',
]);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[’']s\b/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 3 && !STOP.has(word))
  );
}

/**
 * Names a type went by before, so a deck written then still finds its steps.
 * Short Response was Daily Pages until Nov 15 (Brian).
 */
const FORMER_TYPE_NAMES: Partial<Record<StepType, string[]>> = {
  daily_pages: ['daily pages'],
};

/** How well an agenda line names a step: shared words, and its type said out loud. */
function score(item: string, step: AgendaStep): number {
  const said = words(item);
  let shared = 0;
  for (const word of words(step.title)) if (said.has(word)) shared += 1;
  const line = item.toLowerCase();
  const names = [STEP_TYPE_LABELS[step.type].toLowerCase(), ...(FORMER_TYPE_NAMES[step.type] ?? [])];
  return shared + (names.some((name) => line.includes(name)) ? 2 : 0);
}

/** Each agenda line's step, or null. A step answers one line at most. */
function matchSteps(items: string[], steps: AgendaStep[]): Array<AgendaStep | null> {
  const used = new Set<number>();
  const matched = items.map((item) => {
    let best = -1;
    let bestScore = 0;
    steps.forEach((step, index) => {
      if (used.has(index)) return;
      const value = score(item, step);
      if (value > bestScore) {
        best = index;
        bestScore = value;
      }
    });
    if (best < 0) return null;
    used.add(best);
    return steps[best]!;
  });
  // The agenda and the stack line up one for one: order names the rest.
  if (items.length === steps.length) {
    return matched.map((step, index) => step ?? (used.has(index) ? null : steps[index]!));
  }
  return matched;
}

export function syncAgendaToStack<T extends SlideDeck>(deck: T, steps: AgendaStep[]): T {
  if (!steps.length || !deck.slides.some((slide) => slide.agenda?.length)) return deck;
  let changed = false;
  const slides = deck.slides.map((slide) => {
    if (!slide.agenda?.length) return slide;
    const matched = matchSteps(
      slide.agenda.map((item) => item.title),
      steps
    );
    // A line that stands for two steps ("Class starter, context": an agenda
    // holds six lines, a plan may have seven steps) keeps the minutes of
    // both. Matched to one of them it showed that step's minutes alone, and
    // the agenda on screen came to 45 for a 50-minute lesson (Nov 22). Such a
    // deck's agenda already adds up to the stack: it is left as it is.
    const total = steps.reduce((sum, step) => sum + step.minutes, 0);
    const shown = slide.agenda.reduce((sum, item) => sum + (item.minutes ?? 0), 0);
    if (slide.agenda.length < steps.length && shown === total) return slide;
    const agenda = slide.agenda.map((item, index) => {
      const step = matched[index];
      if (!step || step.minutes === item.minutes) return item;
      changed = true;
      return { ...item, minutes: step.minutes };
    });
    return { ...slide, agenda };
  });
  return changed ? { ...deck, slides } : deck;
}
