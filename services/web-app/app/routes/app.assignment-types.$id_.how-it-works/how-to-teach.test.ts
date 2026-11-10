import { describe, expect, test } from 'bun:test';
import { LANDING_PAGES, landingPagePlainText } from '../app.assignment-types.$id/landing-copy/content';
import { GUIDE_HOW_TO_TEACH_KEYS, guideHowToTeachSection } from './how-to-teach';

function text(key: (typeof GUIDE_HOW_TO_TEACH_KEYS)[number]) {
  const section = guideHowToTeachSection(key);
  return landingPagePlainText({ ...LANDING_PAGES[key], description: [], sections: [section] });
}

describe('How to Teach It on the four How It Works pages', () => {
  test('covers Class Starter, Pre-Writing, Thesis Statement and Exit Ticket', () => {
    expect([...GUIDE_HOW_TO_TEACH_KEYS].sort()).toEqual(
      ['class-starter', 'exit-ticket', 'prewriting', 'thesis-statement'].sort()
    );
  });

  test('every page names it How to Teach It, as on the landing page', () => {
    for (const key of GUIDE_HOW_TO_TEACH_KEYS) {
      const section = guideHowToTeachSection(key);
      expect({ key, id: section.id, heading: section.heading }).toEqual({
        key,
        id: 'how-to-teach-it',
        heading: 'How to Teach It',
      });
    }
  });

  test('Pre-Writing and Thesis Statement use their landing page block as it is: the lead, then the lesson’s deck and tutorial', () => {
    for (const key of ['prewriting', 'thesis-statement'] as const) {
      const landing = LANDING_PAGES[key].sections.find((s) => s.id === 'how-to-teach-it');
      expect(guideHowToTeachSection(key)).toEqual(landing!);
      expect(guideHowToTeachSection(key).blocks.some((b) => b.type === 'lesson')).toBe(true);
    }
  });

  test('Class Starter and Exit Ticket use Brian’s How it works copy, every bold lead kept', () => {
    for (const key of ['class-starter', 'exit-ticket'] as const) {
      const landing = LANDING_PAGES[key].sections.find((s) => s.id === 'how-it-works')!;
      const guide = guideHowToTeachSection(key);
      expect(guide.blocks.length).toBe(landing.blocks.length);
      const leads = (s: string) => s.match(/\*\*[^*]+\*\*/g) ?? [];
      expect(leads(JSON.stringify(guide.blocks))).toEqual(leads(JSON.stringify(landing.blocks)));
    }
    expect(text('class-starter')).toContain('Grading is about effort.');
    expect(text('exit-ticket')).toContain('Reflection/Question:');
    expect(text('exit-ticket')).toContain('Check for understanding:');
    expect(text('exit-ticket')).toContain('Grading is optional.');
  });

  test('says where New is: the guide has no New button above it and no library below it', () => {
    for (const key of GUIDE_HOW_TO_TEACH_KEYS) {
      expect({ key, above: /\babove\b/i.test(text(key)), below: /\bbelow\b/i.test(text(key)) }).toEqual({
        key,
        above: false,
        below: false,
      });
    }
    expect(text('class-starter')).toContain(
      'On the Class Starter page, click New to write a prompt, or pick one from its Prompt Library.'
    );
    expect(text('exit-ticket')).toContain('On the Exit Ticket page, click New and choose a type:');
  });
});
