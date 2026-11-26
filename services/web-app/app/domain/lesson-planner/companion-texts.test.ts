/**
 * Companion texts (Kevin, Nov 26; rules C1–C8): chosen by thematic topic,
 * real and exact, printed from Yawp!'s copy and checked against it.
 */
import { describe, expect, test } from 'bun:test';
import { withCompanionsChecked } from './companion-check.server';
import { COMPANION_TEXTS, companionsUsed, searchCompanionTexts } from './companion-texts';
import { WORK_VISUAL_KITS } from './work-visuals';

const TOPICS = new Set(['identity', 'truth', 'change', 'morality', 'time-memory', 'meaning', 'belonging', 'suffering', 'ambition', 'family', 'responsibility', 'relationships', 'power', 'freedom', 'justice', 'loss', 'fear', 'love', 'technology', 'free-will', 'faith', 'fairness', 'friendship']);

describe('the library', () => {
  test('every companion is filed by the class-starter library’s own topics and pairs with real kits', () => {
    const kits = new Set(WORK_VISUAL_KITS.map((kit) => kit.id));
    for (const entry of COMPANION_TEXTS) {
      expect(entry.topics.length).toBeGreaterThan(0);
      for (const topic of entry.topics) expect({ id: entry.id, topic, known: TOPICS.has(topic) }).toEqual({ id: entry.id, topic, known: true });
      for (const kit of entry.pairsWith) expect({ id: entry.id, kit, known: kits.has(kit) }).toEqual({ id: entry.id, kit, known: true });
    }
  });

  test('only public-domain texts are held whole; the rest say where to find them (C6)', () => {
    for (const entry of COMPANION_TEXTS) {
      if (entry.text) {
        expect(entry.publicDomain).toBe(true);
        expect(entry.year).toBeLessThan(1930);
        expect(entry.text).not.toMatch(/[{}<>|]|\[\[/);
      } else expect(entry.where).toBeTruthy();
    }
    expect(COMPANION_TEXTS.find((entry) => entry.id === 'the-lottery')?.text).toBeUndefined();
  });

  test('"Ozymandias" is held as first printed, with Shelley’s "desart"', () => {
    const oz = COMPANION_TEXTS.find((entry) => entry.id === 'ozymandias')!;
    expect(oz.text!.split('\n')[0]).toBe('I met a traveller from an antique land');
    expect(oz.text).toContain('Stand in the desart.');
    expect(oz.text!.split('\n').filter((line) => line.trim())).toHaveLength(14);
  });
});

describe('searching (C1: by topic, never just by period)', () => {
  test('a work and its topics: poems that pair with it and share a topic come first', () => {
    const found = searchCompanionTexts({ work: 'Macbeth', topics: ['power', 'ambition'] });
    expect(found[0]!.id).toBe('ozymandias');
    expect(found[0]!.printable).toBe(true);
    expect(found[0]!.text).toContain('Look on my works');
    expect(found[0]!.matched).toContain('pairs with Macbeth');
    expect(found.length).toBeLessThanOrEqual(6);
  });

  test('a copyrighted companion comes with where to find it, never its text', () => {
    const lottery = searchCompanionTexts({ work: 'Chronicle of a Death Foretold', topics: ['morality'] }).find((entry) => entry.id === 'the-lottery');
    expect(lottery?.printable).toBe(false);
    expect(lottery?.text).toBeUndefined();
    expect(lottery?.where).toContain('paperclip');
    expect(lottery?.care).toBeTruthy();
  });

  test('topics in the teacher’s words; a work Yawp! has no kit for is matched by topic alone', () => {
    expect(searchCompanionTexts({ topics: ['fate'] }).map((entry) => entry.id)).toContain('invictus');
    expect(searchCompanionTexts({ topics: ['time and memory'] }).map((entry) => entry.id)).toContain('nothing-gold-can-stay');
    expect(searchCompanionTexts({ work: 'A novel Yawp! does not know', topics: ['justice'] }).length).toBeGreaterThan(0);
    expect(searchCompanionTexts({ work: 'Macbeth', topics: ['power'], kind: 'poem' }).every((entry) => entry.kind === 'poem')).toBe(true);
  });
});

describe('a companion’s lines are checked against the companion (C6)', () => {
  const lesson = (line: string) =>
    `# Power and time\n\nRead Shelley’s “Ozymandias” aloud twice.\n\n\`\`\`yawp-material\nkind: handout\ntitle: Ozymandias\n---\n${line}\n\`\`\``;

  test('a quoted companion is found; a misremembered line is corrected to the first printing', () => {
    const reply = lesson('“My name is Ozymandias, king of kings: Look upon my works, ye Mighty, and despair!”') + '\n\nThe traveller says: “Two vast and trunkless legs of stone stand in the desert.”';
    expect(companionsUsed(reply).map((entry) => entry.id)).toEqual(['ozymandias']);
    const checked = withCompanionsChecked(reply);
    expect(checked.used.map((entry) => entry.id)).toEqual(['ozymandias']);
    expect(checked.reply).toContain('Look on my works, ye Mighty, and despair');
    expect(checked.reply).not.toContain('Look upon my works');
    expect(checked.corrected).toBeGreaterThan(0);
    expect(checked.verified.length).toBeGreaterThan(0);
  });

  test('a lesson that only names a companion, or quotes none, is left alone', () => {
    const named = 'Pair Macbeth with “Ozymandias” next week.';
    expect(withCompanionsChecked(named)).toMatchObject({ reply: named, used: [] });
  });
});
