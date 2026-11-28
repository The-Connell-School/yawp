/**
 * The true lines, kept as verse (plan item 2, Nov 22). The bodies are round
 * 3's "Dulce et Decorum Est" excerpt slides, as the planner wrote them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { passageFromSource, passageLines } from './excerpt-source';
import { prepareSource } from './quotation-check.server';
import { stripGutenberg } from './source-texts.server';

const OWEN = prepareSource(stripGutenberg(readFileSync(join(import.meta.dir, 'fixtures', 'accuracy', 'source-owen-poems.txt'), 'utf8')), 'poems');

describe('passageFromSource', () => {
  test('verse run together with slashes comes back one line to a line, a garbled last line as Owen wrote it', () => {
    const body =
      'Bent double, like old beggars under sacks, / Knock-kneed, coughing like hags, we cursed through sludge, / Till on the haunting flares we turned our backs, / And towards our distant rest began to trudge. / Men marched asleep. Many had lost their boots, / But limped on, blood-shod. All went lame; all blind; / Drunk with fatigue; deaf even to the hoots / Of gas-shells dropping softly behind.';
    const text = passageFromSource(body, OWEN)!;
    const lines = text.split('\n');
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe('Bent double, like old beggars under sacks,');
    expect(lines[7]).toBe('Of tired, outstripped Five-Nines that dropped behind.');
  });

  test('two lines left out without a mark are put back when the passage fits the slide', () => {
    const body =
      "If in some smothering dreams, you too could pace / Behind the wagon that we flung him in, / And watch the white eyes writhing in his face, / His hanging face, like a devil's sick of sin; / If you could hear, at every jolt, the blood / Come gargling from the froth-corrupted lungs— / My friend, you would not tell with such high zest / To children ardent for some desperate glory, / The old Lie: Dulce et decorum est / Pro patria mori.";
    const text = passageFromSource(body, OWEN)!;
    expect(text).toContain('Obscene as cancer, bitter as the cud');
    expect(text).toContain('Of vile, incurable sores on innocent tongues,—');
    // Gutenberg's "--" is a dash; its _italics_ lose their marks.
    expect(text).not.toContain('--');
    expect(text).not.toContain('_');
    expect(text.split('\n').at(-1)).toBe('Pro patria mori.');
  });

  test('a passage too long for the slide keeps the lines chosen, and marks where lines were left out', () => {
    const body = [
      'Bent double, like old beggars under sacks,',
      'Knock-kneed, coughing like hags, we cursed through sludge,',
      'My friend, you would not tell with such high zest',
      'To children ardent for some desperate glory,',
      'The old Lie: Dulce et decorum est',
      'Pro patria mori.',
    ].join('\n');
    const text = passageFromSource(body, OWEN)!;
    expect(text.split('\n')).toEqual([
      'Bent double, like old beggars under sacks,',
      'Knock-kneed, coughing like hags, we cursed through sludge,',
      '[…]',
      'My friend, you would not tell with such high zest',
      'To children ardent for some desperate glory,',
      'The old Lie: Dulce et decorum est',
      'Pro patria mori.',
    ]);
  });

  test('a passage that is not in the work is left alone', () => {
    expect(passageFromSource('Shall I compare thee to a summer’s day? / Thou art more lovely and more temperate: / Rough winds do shake the darling buds of May, / And summer’s lease hath all too short a date.', OWEN)).toBeNull();
  });

  test('a single line, or a passage already exact, is left alone', () => {
    expect(passageFromSource('Bent double, like old beggars under sacks,', OWEN)).toBeNull();
  });
});

describe('passageLines', () => {
  test('lines on new lines or run together with slashes', () => {
    expect(passageLines('One line / two line\nthree')).toEqual(['One line', 'two line', 'three']);
  });
});
