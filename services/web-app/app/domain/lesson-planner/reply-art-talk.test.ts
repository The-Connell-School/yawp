import { describe, expect, test } from 'bun:test';
import { withoutArtTalk } from './reply-art-talk';

const deck = (art?: string) =>
  '```yawp-slides\n' + JSON.stringify({ title: 'R', ...(art ? { art } : {}), slides: [{ layout: 'title', title: 'R', speakerNotes: 'Let the painting sit for a moment.' }] }) + '\n```';

describe('withoutArtTalk (round 4, Nov 22)', () => {
  test('the planner weighing paintings against the teacher’s other lessons is taken out', () => {
    const reply = `## Plan\n\nRead the Prologue.\n\nNow for the deck. Hokusai's Great Wave fits, but that painting was used in your Macbeth unit, so I'm going with the Degas instead.\n\n${deck('degas-dance-class')}`;
    const out = withoutArtTalk(reply);
    expect(out).not.toContain('used in your Macbeth unit');
    expect(out).toContain('Read the Prologue.');
    expect(out).toContain('Let the painting sit for a moment.');
  });

  test('a painting described for a deck that has none is taken out; one that is there stays', () => {
    const talk = "The deck opens on Bruegel's Children's Games, on the title slide.";
    expect(withoutArtTalk(`## Plan\n\n${talk}\n\n${deck()}`)).not.toContain('Bruegel');
    expect(withoutArtTalk(`## Plan\n\n${talk}\n\n${deck('bruegel-childrens-games')}`)).toContain('Bruegel');
  });

  test('a reply that says nothing of paintings is returned as it was', () => {
    const reply = `## Plan\n\nRead.\n\n${deck()}`;
    expect(withoutArtTalk(reply)).toBe(reply);
  });
});
