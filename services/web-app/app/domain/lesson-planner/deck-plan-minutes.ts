/**
 * Minutes that agree (13-lesson review, Nov 22; Brian: "a deck's minutes must
 * add up to the lesson"). The plan said 50, the deck 47 to 55 and its own
 * agenda 44 to 46. The plan's steps are the truth: the agenda slide lists
 * them with their minutes, and the slides' minutes are brought to the plan's
 * total, the difference taken from (or given to) the longest slide that is not
 * a timed writing slide.
 */
import { readPlanSteps } from './plan-steps';
import { fenceSlideDeck, MAX_AGENDA_ITEMS, readSlideDeck, validateSlideDeck, type Slide, type SlideDeck } from './slide-deck';

/** The deck with its agenda and minutes matching the plan's steps. */
export function deckMatchingPlan<T extends SlideDeck>(deck: T, steps: Array<{ title: string; minutes: number | null }>): T {
  const timed = steps.filter((step): step is { title: string; minutes: number } => step.minutes != null && step.minutes > 0);
  if (timed.length < 2) return deck;
  const planTotal = timed.reduce((sum, step) => sum + step.minutes, 0);
  let slides: Slide[] = deck.slides.map((slide) =>
    slide.layout === 'agenda' ? { ...slide, agenda: agendaOf(timed) } : slide
  );
  const deckTotal = slides.reduce((sum, slide) => sum + (slide.layout === 'agenda' ? 0 : (slide.minutes ?? 0)), 0);
  const gap = planTotal - deckTotal;
  if (deckTotal > 0 && gap !== 0) {
    const order = slides
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => slide.layout !== 'agenda' && (slide.minutes ?? 0) > 0)
      .sort((a, b) => Number(a.slide.layout === 'write') - Number(b.slide.layout === 'write') || (b.slide.minutes ?? 0) - (a.slide.minutes ?? 0));
    let left = gap;
    for (const { index } of order) {
      if (left === 0) break;
      const now = slides[index]!.minutes ?? 0;
      const next = Math.max(1, now + left);
      left -= next - now;
      slides = slides.map((slide, i) => (i === index ? { ...slide, minutes: next } : slide));
    }
  }
  return { ...deck, slides };
}

/**
 * The plan's steps as agenda lines, no more than an agenda slide holds: past
 * that, the two neighbouring steps with the fewest minutes between them share
 * a line, so every step is still there and the minutes still add up
 * (re-test, Nov 22: a nine-step plan made an agenda the deck could not hold,
 * and the deck was lost).
 */
function agendaOf(steps: Array<{ title: string; minutes: number }>): Array<{ title: string; minutes: number }> {
  let lines = steps.map((step) => ({ title: shortTitle(step.title), minutes: step.minutes }));
  while (lines.length > MAX_AGENDA_ITEMS) {
    let at = 0;
    for (let i = 1; i < lines.length - 1; i += 1) {
      if (lines[i]!.minutes + lines[i + 1]!.minutes < lines[at]!.minutes + lines[at + 1]!.minutes) at = i;
    }
    const [a, b] = [lines[at]!, lines[at + 1]!];
    const joined = `${a.title}, ${b.title.charAt(0).toLowerCase()}${b.title.slice(1)}`;
    lines = [...lines.slice(0, at), { title: joined.length <= 70 ? joined : a.title, minutes: a.minutes + b.minutes }, ...lines.slice(at + 2)];
  }
  return lines;
}

/** "Context: Igbo society and Achebe's purpose" → "Context", for an agenda line. */
function shortTitle(title: string): string {
  const cut = title.split(/[:—–]/)[0]!.trim();
  return (cut.length >= 4 ? cut : title).slice(0, 60);
}

/** The reply with its deck matching its plan; a reply without both comes back as it was. */
export function withDeckMatchingPlan(reply: string): string {
  const outcome = readSlideDeck(reply);
  if (outcome.kind !== 'deck') return reply;
  const steps = readPlanSteps(outcome.body);
  if (steps.length < 2) return reply;
  const matched = deckMatchingPlan(outcome.deck, steps);
  if (matched === outcome.deck) return reply;
  // Never trade a deck that builds for one that does not.
  if (!validateSlideDeck(JSON.stringify(matched)).ok) return reply;
  return `${outcome.body.trim()}\n\n${fenceSlideDeck(matched)}`;
}
