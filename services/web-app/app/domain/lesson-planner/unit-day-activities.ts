/**
 * What a unit day's students mostly do, read from the day's own words, so the
 * unit map can show it at a glance (Kevin, Nov 23: "I almost want less words
 * and I want a picture or emoji that highlights the major activities in each
 * lesson (book for reading, pencil for writing, gavel for debate or seminar,
 * a screen or projector for lecture)"). The day's full text stays one click
 * away; this is the glance.
 */
import type { UnitPlan } from './unit-plan';

export type UnitActivity = 'starter' | 'teach' | 'read' | 'close' | 'discuss' | 'seminar' | 'debate' | 'pairs' | 'film' | 'write' | 'check';

/** Each activity: its words, and its short label, in the order a lesson usually runs. */
const ACTIVITIES: Array<{ kind: UnitActivity; label: string; words: RegExp }> = [
  { kind: 'starter', label: 'Starter', words: /\bclass starter|\bstarter\b|\bdo now\b|\bwarm[- ]up\b|\bquickwrite\b|\bquick write\b/i },
  { kind: 'teach', label: 'Mini-lesson', words: /\bdirect teaching|\bmini[- ]lesson|\blecture|\bteach(?:er)? (?:models?|introduces?|explains?)|\bmodel(?:ing|s)?\b|\bthink[- ]aloud|\bcontext (?:slides?|lesson|talk)|\bbackground\b/i },
  { kind: 'read', label: 'Read', words: /\bread(?:s|ing)? (?:aloud|together|in class|silently)|\bread aloud\b|\bindependent reading\b/i },
  { kind: 'close', label: 'Close reading', words: /\bclose[- ]read|\bannotat|\bpassage analysis\b/i },
  { kind: 'seminar', label: 'Seminar', words: /\bseminar|\bsocratic|\bfishbowl|\binner[/ ]outer\b|\bharkness\b/i },
  { kind: 'debate', label: 'Debate', words: /\bdebate|\bmock trial|\btrial\b|\bfour corners\b|\bspectrum\b/i },
  { kind: 'discuss', label: 'Discuss', words: /\bdiscuss|\bdiscussion|\bshare[- ]out\b|\bquick share\b|\bshare\b|\bwhole[- ]class\b|\bturn and talk\b|\bconversation\b/i },
  { kind: 'pairs', label: 'Pairs', words: /\bpairs?\b|\bpaired\b|\bpartners?\b|\bsmall groups?\b|\bgroups?\b|\bjigsaw\b/i },
  { kind: 'film', label: 'Film', words: /\bfilm\b|\bvideo\b|\bclip\b|\bdocumentary\b/i },
  { kind: 'write', label: 'Write', words: /\bshort response\b|\bessay\b|\bposition paper\b|\bparagraph\b|\bwrit(?:e|es|ing)\b|\bdraft\b|\bjournal\b|\breflection\b/i },
  { kind: 'check', label: 'Exit ticket', words: /\bexit ticket\b|\bquick check\b|\bquiz\b|\bcheck for understanding\b/i },
];

export const ACTIVITY_LABELS: Record<UnitActivity, string> = Object.fromEntries(ACTIVITIES.map((activity) => [activity.kind, activity.label])) as Record<UnitActivity, string>;

type Day = UnitPlan['days'][number];

/** No reading that day ("None", "None — this day is entirely student-driven"). */
const NO_READING = /^\s*(?:none|no reading|n\/a|—|-)\b/i;

/**
 * The day's activities in lesson order, at most five. The reading counts when
 * the day names one; the class starter, the writing and the check from the
 * day's own lines. A day whose words name nothing gets nothing: no guessing.
 */
export function unitDayActivities(day: Pick<Day, 'reading' | 'students' | 'check'>): UnitActivity[] {
  const said = [day.students ?? '', day.check ?? ''].join(' \n ');
  const found = new Set<UnitActivity>();
  for (const activity of ACTIVITIES) if (activity.words.test(said)) found.add(activity.kind);
  if (day.reading && !NO_READING.test(day.reading)) found.add('read');
  // A close reading is a reading; one chip says it.
  if (found.has('close')) found.delete('read');
  // A debate or seminar is the day's talk; pairs inside it are how, not what.
  if (found.has('debate') || found.has('seminar')) {
    found.delete('discuss');
    found.delete('pairs');
  }
  return ACTIVITIES.map((activity) => activity.kind)
    .filter((kind) => found.has(kind))
    .slice(0, 5);
}

/** The reading, short enough for one line of the map ("Antigone, Scene 1 — read aloud in class" → "Antigone, Scene 1"). */
export function shortReading(reading: string | undefined | null): string | null {
  if (!reading || NO_READING.test(reading)) return null;
  // Not at "pp. 1–26" or "ch. 3" (Nov 25: "Chapter 1 (pp").
  const head = reading.split(/\s+[—–]\s+|;\s+|(?<!\b(?:pp?|ch|chs|sc|vol|ll?|no|vv?))\.\s+/i)[0]!.trim();
  return head.length > 60 ? `${head.slice(0, 59)}…` : head;
}
