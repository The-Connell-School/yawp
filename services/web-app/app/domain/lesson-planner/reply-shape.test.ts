/**
 * The reply's own words, kept to what a teacher needs (Kevin, Nov 23: the
 * Antigone unit reply was a wall of text before its map).
 */
import { describe, expect, test } from 'bun:test';
import { withoutProcessTalk, withStartersOnDays, withUnitMapFirst } from './reply-shape';
import { readUnitPlan } from './unit-plan';

const MAP = '```yawp-unit\n{"title":"When the Law Is Wrong","days":[]}\n```';

const ANTIGONE = [
  'Good — I have everything I need. I’ll write all the prompts myself and build the map around the Socratic seminar. Here’s the unit:',
  'The recurring class starters across the unit are written to mine the unit’s big themes, so students arrive at the seminar with days of their own thinking to draw on. The seminar day’s prep asks them to reread their entries.',
  'A few things to check before you build any day:',
  '- Does this arc feel right? You could flip Socrates and Cohen.\n- The seminar runs two days (Days 10–11).\n- Day 9 is a full in-class writing day.',
  'Just build Day 1 if the map looks right, and we’ll go from there.',
  MAP,
].join('\n\n');

describe('the planner never narrates its own process', () => {
  test('what it has, what it searched, what it will write itself, what it is about to do: gone', () => {
    const out = withoutProcessTalk(ANTIGONE);
    expect(out.startsWith('Here’s the unit:')).toBe(true);
    expect(out).not.toContain('I have everything I need');
    expect(out).not.toContain('myself');
    const lesson = 'Nothing in the Lounge covers Their Eyes Were Watching God, and the Short Response library has no match for chapter 1 — I’ll write the Short Response prompt myself. The class starter library has strong options. Let me build the full lesson and deck now.\n\n# Their Eyes Were Watching God — Chapter 1';
    expect(withoutProcessTalk(lesson)).toBe('# Their Eyes Were Watching God — Chapter 1');
    const antigone = 'Good — I have everything I need. *Antigone* is in the public domain, so I can quote it directly. I\'ll write all three class starters and the Short Response from scratch, and build the full lesson and deck now.\n\n## Enter Antigone (50 min)';
    expect(withoutProcessTalk(antigone)).toBe('## Enter Antigone (50 min)');
    expect(withoutProcessTalk("Here's the full plan and deck. I'm using F. Storr's 1912 translation (public domain) for all quoted passages, and I'll note that on the handout.\n\n## Step 1")).toBe("Here's the full plan and deck.\n\n## Step 1");
    expect(withoutProcessTalk('The Odyssey is in the public domain (Homer, composed ~8th century BCE), so I can quote it directly — I\'ll use Samuel Butler\'s translation.\n\n## Step 1')).toBe('## Step 1');
    expect(withoutProcessTalk('Now for the deck:\n\n## Slides')).toBe('## Slides');
    expect(withoutProcessTalk('The *Narrative of the Life of Frederick Douglass* (1845) is in the public domain, so passages can be quoted and printed in full. Here is the unit map: 15 days.\n\n## Map')).toBe('Here is the unit map: 15 days.\n\n## Map');
    expect(withoutProcessTalk('Here\'s the full plan. "Dulce et Decorum Est" is in the public domain, so all passages are quoted directly from Owen\'s text.\n\n## Step 1')).toBe('Here\'s the full plan.\n\n## Step 1');
  });

  test('the lesson’s own words, lists and fenced blocks are never touched', () => {
    const plain = 'Students read the opening aloud. I’ll model the first annotation myself.\n\n- Let me know if you want a shorter version.\n\n```yawp-slides\n{"note":"Let me build this now."}\n```';
    expect(withoutProcessTalk(plain)).toBe(plain);
  });
});

describe('a unit’s map first', () => {
  test('two sentences before the map; the reasons and the questions after it', () => {
    const out = withUnitMapFirst(withoutProcessTalk(ANTIGONE));
    const [lead, map, ...rest] = out.split('\n\n');
    expect(lead).toBe('Here’s the unit:');
    expect(map).toBe(MAP);
    expect(rest.join('\n\n')).toContain('A few things to check before you build any day:');
    expect(rest.join('\n\n')).toContain('Just build Day 1');
  });

  test('a reply that already leads with the map, or has none, is unchanged', () => {
    const short = `Here is a twelve-day unit on Antigone.\n\n${MAP}\n\nWhich day first?`;
    expect(withUnitMapFirst(short)).toBe(short);
    expect(withUnitMapFirst('No map here.')).toBe('No map here.');
  });
});

describe('the class starters on their days, not in a list under the map (Kevin, Nov 25)', () => {
  const map = (days: unknown[]) => '```yawp-unit\n' + JSON.stringify({ title: 'Chronicle of a Death Foretold', days }) + '\n```';
  const days = [1, 2, 3].map((day) => ({ day, title: `Day ${day}`, objective: 'o', students: 's' }));
  const reply = [
    'Here’s the 8-day map.',
    map(days),
    'The class starters across the unit:',
    '- **Day 1** — “Is anything in your life already decided?”\n- Day 2: "When does a whole town share the blame?"\n- **Days 3** (FW-013) — *Who decides what honor demands?*',
    '1. **Does this arc match what you want?**\n2. **How should the seminar end?**',
  ].join('\n\n');

  test('each prompt is on its day; the list and its lead-in are gone; the questions stay', () => {
    const out = withStartersOnDays(reply);
    const outcome = readUnitPlan(out);
    expect(outcome.kind).toBe('unit');
    const unit = outcome.kind === 'unit' ? outcome.unit : null;
    expect(unit?.days.map((d) => d.starter)).toEqual([
      'Is anything in your life already decided?',
      'When does a whole town share the blame?',
      'Who decides what honor demands?',
    ]);
    expect(out).not.toContain('The class starters across the unit');
    expect(out).not.toContain('Day 2:');
    expect(out).toContain('Does this arc match what you want?');
    expect(out.startsWith('Here’s the 8-day map.')).toBe(true);
  });

  test('a day that already has its starter keeps it; a single mention is not a list', () => {
    const own = withStartersOnDays(reply.replace(map(days), map([{ ...days[0], starter: 'Mine.' }, days[1], days[2]])));
    const outcome = readUnitPlan(own);
    expect(outcome.kind === 'unit' && outcome.unit.days[0]!.starter).toBe('Mine.');
    const one = ['Map:', map(days), '- Day 1 — “Only one.”'].join('\n\n');
    expect(withStartersOnDays(one)).toBe(one);
  });
});

describe('the Chronicle unit reply, Nov 25', () => {
  test('the Lounge narration goes, the map’s own lead-in stays on top, and the bare rule goes', () => {
    const map = '```yawp-unit\n{"title":"Chronicle","days":[{"day":1,"title":"t","objective":"o","students":"s"}]}\n```';
    const reply = [
      'The Lounge has no García Márquez–specific material, so the unit is built from scratch. I’ve written all the class starters myself since the library had nothing for this text.',
      'Here’s the full eight-day map:',
      '---',
      map,
      '**Before you build:**\n\n1. Does this cover what you want?',
    ].join('\n\n');
    const out = withUnitMapFirst(withoutProcessTalk(reply));
    expect(out).not.toContain('Lounge');
    expect(out).not.toContain('myself');
    expect(out).not.toContain('---');
    expect(out.startsWith('Here’s the full eight-day map:\n\n```yawp-unit')).toBe(true);
    expect(out.trimEnd().endsWith('1. Does this cover what you want?')).toBe(true);
  });
});
