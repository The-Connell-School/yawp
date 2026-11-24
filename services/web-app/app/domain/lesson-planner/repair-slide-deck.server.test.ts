import { describe, expect, test } from 'bun:test';
import { readSlideDeck, SLIDE_DECK_FENCE } from './slide-deck';
import {
  buildDeckRepairInstruction,
  repairSlideDeck,
} from './repair-slide-deck.server';

const brokenDeck = {
  title: 'Conclusions that land',
  slides: [
    // No speakerNotes, and a bullets slide with nothing to show.
    { layout: 'bullets', title: 'What a conclusion does' },
  ],
};

const fixedDeck = {
  title: 'Conclusions that land',
  slides: [
    {
      layout: 'bullets',
      title: 'What a conclusion does',
      bullets: ['Answers "so what?"', 'Leaves one idea behind'],
      speakerNotes: 'Ask for their own last sentences first.',
    },
  ],
};

function replyWith(deck: unknown): string {
  return `Here's the lesson.\n\n\`\`\`${SLIDE_DECK_FENCE}\n${JSON.stringify(
    deck,
    null,
    2
  )}\n\`\`\`\n\nWant a handout too?`;
}

describe('repairSlideDeck', () => {
  test('leaves a reply with no deck alone', async () => {
    const reply = 'Just a plan, no deck.';
    const result = await repairSlideDeck({
      reply,
      repair: async () => {
        throw new Error('should not be called');
      },
    });
    expect(result.outcome).toBe('none');
    expect(result.reply).toBe(reply);
  });

  test('leaves a deck that already validates alone', async () => {
    const reply = replyWith(fixedDeck);
    const result = await repairSlideDeck({
      reply,
      repair: async () => {
        throw new Error('should not be called');
      },
    });
    expect(result.outcome).toBe('none');
    expect(result.reply).toBe(reply);
  });

  test('swaps a corrected deck into the reply in place', async () => {
    const result = await repairSlideDeck({
      reply: replyWith(brokenDeck),
      repair: async () => JSON.stringify(fixedDeck),
    });

    expect(result.outcome).toBe('repaired');
    // The prose around the deck survives untouched.
    expect(result.reply).toContain("Here's the lesson.");
    expect(result.reply).toContain('Want a handout too?');

    const outcome = readSlideDeck(result.reply);
    expect(outcome.kind).toBe('deck');
    if (outcome.kind !== 'deck') throw new Error('expected a deck');
    expect(outcome.deck.slides[0]!.bullets).toHaveLength(2);
  });

  test('accepts a fixed deck the model wrapped in a fence', async () => {
    const result = await repairSlideDeck({
      reply: replyWith(brokenDeck),
      repair: async () =>
        `Fixed it:\n\n\`\`\`json\n${JSON.stringify(fixedDeck)}\n\`\`\``,
    });
    expect(result.outcome).toBe('repaired');
    expect(readSlideDeck(result.reply).kind).toBe('deck');
  });

  test('gives up cleanly when the second attempt is no better', async () => {
    const reply = replyWith(brokenDeck);
    const result = await repairSlideDeck({
      reply,
      repair: async () => 'Sorry, I could not.',
    });
    expect(result.outcome).toBe('unrepaired');
    expect(result.reply).toBe(reply);
    expect(result.reason).toContain('speakerNotes');
  });

  test('never lets a failed repair call break the teacher’s reply', async () => {
    const reply = replyWith(brokenDeck);
    const result = await repairSlideDeck({
      reply,
      repair: async () => {
        throw new Error('model timed out');
      },
    });
    expect(result.outcome).toBe('unrepaired');
    expect(result.reply).toBe(reply);
  });

  test('does not repair the same deck twice', async () => {
    let calls = 0;
    await repairSlideDeck({
      reply: replyWith(brokenDeck),
      repair: async () => {
        calls += 1;
        return 'still broken';
      },
    });
    expect(calls).toBe(1);
  });

  test('hands the caller the failure reason so it can be logged', async () => {
    let seen = '';
    await repairSlideDeck({
      reply: replyWith(brokenDeck),
      repair: async ({ instruction, reason }) => {
        seen = reason;
        expect(instruction).toContain(reason);
        return JSON.stringify(fixedDeck);
      },
    });
    expect(seen).toContain('slides.0.speakerNotes');
  });
});

describe('buildDeckRepairInstruction', () => {
  const instruction = buildDeckRepairInstruction({
    json: JSON.stringify(brokenDeck),
    reason: 'slides.0.bullets: A bullets slide needs bullets.',
  });

  test('hands back the exact errors and the deck that caused them', () => {
    expect(instruction).toContain('slides.0.bullets');
    expect(instruction).toContain('What a conclusion does');
  });

  test('keeps the Deck Kit v3 slots and the deck colors', () => {
    for (const slot of ['processStep', 'choices', 'answer', 'button', 'course', 'color', 'colors']) {
      expect(instruction).toContain(`"${slot}"`);
    }
    expect(instruction).toContain('3 or fewer');
  });

  test('asks for JSON only, so the fix can be spliced in', () => {
    const lower = instruction.toLowerCase();
    expect(lower).toContain('only the corrected json');
    expect(lower).toContain('no explanation');
  });

  test('restates the rules that are easiest to break', () => {
    expect(instruction).toContain('speakerNotes');
    expect(instruction).toContain('bullets');
    expect(instruction).toContain('compare');
  });
});

describe('the repair keeps the slides that teach (preview, Nov 21: The Grapes of Wrath)', () => {
  const instruction = buildDeckRepairInstruction({ json: '{}', reason: 'slides.9.terms: Array must contain at most 3 element(s)' });

  test('it knows the timeline, map, define, person and picture slides, and what each needs', () => {
    for (const rule of ['timeline needs "events"', 'map needs "places"', 'define needs "terms"', 'person needs "people"', 'picture needs "image"']) expect(instruction).toContain(rule);
  });

  test('it fixes only what the errors name and never turns a slide into a list', () => {
    expect(instruction).toContain('Fix only what the errors name');
    expect(instruction).toContain('Never turn a timeline, map, define, person, world or picture slide into notes, bullets or a statement');
    expect(instruction).toContain('split it into two slides of the same kind');
    expect(instruction).toContain('Keep every "image" id and every "wants"');
  });

  test('a lesson whose deck was asked for and lost gets one written from its plan (rules test, Nov 23: the Odyssey deck)', async () => {
    const plan = `# Hero or Show-Off?\n\n## 1. Class starter (5 min)\nWrite about a time.\n\n## 2. Read Book 9 (15 min)\nRead aloud.\n\n## 3. Talk (10 min)\nPairs.\n\n## 4. Write (15 min)\nA paragraph.\n\n${'More of the plan. '.repeat(200)}`;
    let asked = '';
    const result = await repairSlideDeck({
      reply: plan,
      wanted: true,
      repair: async ({ instruction }) => {
        asked = instruction;
        return JSON.stringify(fixedDeck);
      },
    });
    expect(asked).toContain('The teacher asked for a slide deck with this lesson and the reply has none');
    expect(asked).toContain('## 2. Read Book 9 (15 min)');
    expect(result.outcome).toBe('rebuilt');
    expect(readSlideDeck(result.reply).kind).toBe('deck');
    expect(result.reply.startsWith('# Hero or Show-Off?')).toBe(true);
  });

  test('no deck asked for, a question back to the teacher, or a unit map: no deck written', async () => {
    const never = async () => {
      throw new Error('should not be called');
    };
    expect((await repairSlideDeck({ reply: 'Which class is this for?', wanted: true, repair: never })).outcome).toBe('none');
    const unit = `Here is the unit.\n\n\`\`\`yawp-unit\n{}\n\`\`\`\n\n## A\n## B\n## C\n${'x'.repeat(4000)}`;
    expect((await repairSlideDeck({ reply: unit, wanted: true, repair: never })).outcome).toBe('none');
    const lesson = `## A\n## B\n## C\n${'x'.repeat(4000)}`;
    expect((await repairSlideDeck({ reply: lesson, repair: never })).outcome).toBe('none');
  });
});
