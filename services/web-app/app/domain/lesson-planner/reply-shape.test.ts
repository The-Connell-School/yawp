/**
 * The reply's own words, kept to what a teacher needs (Kevin, Nov 23: the
 * Antigone unit reply was a wall of text before its map).
 */
import { describe, expect, test } from 'bun:test';
import { withoutProcessTalk, withUnitMapFirst } from './reply-shape';

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
