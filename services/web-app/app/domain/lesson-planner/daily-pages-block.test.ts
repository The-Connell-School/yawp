import { describe, expect, test } from 'bun:test';
import {
  dailyPagesCreateHref,
  inlineDailyPagesExercises,
  kindForPromptId,
  readDailyPagesExercises,
  type DailyPagesExercise,
} from './daily-pages-block';
import freewritePrompts from '~/routes/app.assignment-types.$id/prompts-library/prompts.json';
import shortFormPrompts from '~/routes/app.assignment-types.$id/short-form-prompts-library/prompts.json';

describe('readDailyPagesExercises', () => {
  test('lifts a written warm-up out of the plan', () => {
    const { exercises, body } = readDailyPagesExercises(
      '## Warm-up (7 min)\n\n' +
        'Post this and give them four minutes.\n\n' +
        '```yawp-daily-pages\n' +
        'Think of the last time you convinced someone of something.\n' +
        '```\n\n' +
        '## Mini-lesson'
    );

    expect(exercises).toEqual([
      {
        kind: 'class-starter',
        prompt: 'Think of the last time you convinced someone of something.',
        promptId: null,
      },
    ]);
    expect(body).toBe(
      '## Warm-up (7 min)\n\n' +
        'Post this and give them four minutes.\n\n' +
        '## Mini-lesson'
    );
  });

  test('takes the blockquote markers off a quoted prompt', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\n> What made it land?\n> Write for four minutes.\n```'
    );
    expect(exercises[0]!.prompt).toBe(
      'What made it land?\nWrite for four minutes.'
    );
  });

  test('takes the wrapping quotes off too', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\n"What made it land?"\n```'
    );
    expect(exercises[0]!.prompt).toBe('What made it land?');
  });

  test('reads more than one warm-up', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nFirst prompt\n```\n\n' +
        '```yawp-daily-pages\nSecond prompt\n```'
    );
    expect(exercises.map((exercise) => exercise.prompt)).toEqual([
      'First prompt',
      'Second prompt',
    ]);
  });

  test('ignores an empty block', () => {
    const { exercises, body } = readDailyPagesExercises(
      'Here you go.\n\n```yawp-daily-pages\n\n```'
    );
    expect(exercises).toEqual([]);
    expect(body).toBe('Here you go.');
  });

  test('leaves a reply with no block completely alone', () => {
    const reply = '## Warm-up\n\nFour minutes of writing.';
    const { exercises, body } = readDailyPagesExercises(reply);
    expect(exercises).toEqual([]);
    expect(body).toBe(reply);
  });

  test('does not touch an ordinary code block', () => {
    const reply = '```\nyawp-daily-pages\n```';
    expect(readDailyPagesExercises(reply).body).toBe(reply);
  });
});

describe('inlineDailyPagesExercises', () => {
  test('prints the prompt as a blockquote rather than a code fence', () => {
    expect(
      inlineDailyPagesExercises(
        '## Warm-up\n\n```yawp-daily-pages\nWhat made it land?\n```\n\n## Mini-lesson'
      )
    ).toBe('## Warm-up\n\n> What made it land?\n\n## Mini-lesson');
  });

  test('quotes every line of a multi-line prompt', () => {
    expect(
      inlineDailyPagesExercises(
        '```yawp-daily-pages\nWhat made it land?\nWrite for four minutes.\n```'
      )
    ).toBe('> What made it land?\n> Write for four minutes.');
  });

  test('leaves a reply with no block alone', () => {
    const reply = '## Warm-up\n\nFour minutes of writing.';
    expect(inlineDailyPagesExercises(reply)).toBe(reply);
  });
});

describe('dailyPagesCreateHref', () => {
  test('carries the prompt to the assignment sheet', () => {
    // URLSearchParams spells a space "+", which reads back as a space.
    expect(dailyPagesCreateHref('type-1', 'What made it land?')).toBe(
      '/app/assignment-types/type-1?newPrompt=What+made+it+land%3F'
    );
    expect(
      new URLSearchParams('newPrompt=What+made+it+land%3F').get('newPrompt')
    ).toBe('What made it land?');
  });
});

describe('a warm-up the planner found in the library', () => {
  test('carries the prompt id alongside the prompt itself', () => {
    // The teacher should be able to check the reference, and should never have
    // to guess what their students will actually be asked.
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nid: FW-001\nWhat made it land?\n```'
    );
    expect(exercises).toEqual([
      { kind: 'class-starter', prompt: 'What made it land?', promptId: 'FW-001' },
    ]);
  });

  test('does not mistake a prompt that merely starts with a word for an id', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nIdentify the strongest sentence.\n```'
    );
    expect(exercises[0]).toEqual({
      kind: 'class-starter',
      prompt: 'Identify the strongest sentence.',
      promptId: null,
    });
  });

  test('keeps the id out of the printed packet', () => {
    expect(
      inlineDailyPagesExercises(
        '```yawp-daily-pages\nid: FW-001\nWhat made it land?\n```'
      )
    ).toBe('> What made it land?');
  });
});

describe('dailyPagesCreateHref — the way back', () => {
  test('carries the lesson the teacher came from', () => {
    // The button is a door out of the planner. Walking through it should not
    // cost a teacher the half-finished lesson they were standing in.
    expect(dailyPagesCreateHref('type-1', 'What made it land?', 'plan-9')).toBe(
      '/app/assignment-types/type-1?newPrompt=What+made+it+land%3F&fromLesson=plan-9'
    );
  });

  test('leaves the link alone when there is no lesson to return to', () => {
    expect(dailyPagesCreateHref('type-1', 'Write.', null)).toBe(
      '/app/assignment-types/type-1?newPrompt=Write.'
    );
    expect(dailyPagesCreateHref('type-1', 'Write.')).toBe(
      '/app/assignment-types/type-1?newPrompt=Write.'
    );
  });
});

/**
 * Yawp has two short-writing exercises and they are not the same lesson move.
 *
 * A Class Starter is the three minutes that get pens moving at the bell; it is
 * graded on engagement alone. Daily Pages is a real reflection anchored in a
 * text or topic, it takes ten to fifteen minutes of the period, and it is
 * graded on depth. Running both in one ordinary class costs a fifth of the
 * period before anything is taught, so the block has to say which one it is
 * rather than leaving the teacher to infer it from the card.
 */
describe('which exercise a prompt is offered as', () => {
  test('reads a class starter off the block', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nkind: class-starter\nWhat is a rule you would change?\n```'
    );
    expect(exercises).toEqual([
      {
        kind: 'class-starter',
        prompt: 'What is a rule you would change?',
        promptId: null,
      },
    ]);
  });

  test('takes the kind alongside a library id, in either order', () => {
    const idFirst = readDailyPagesExercises(
      '```yawp-daily-pages\nid: FW-001\nkind: class-starter\nWhat made it land?\n```'
    ).exercises[0];
    const kindFirst = readDailyPagesExercises(
      '```yawp-daily-pages\nkind: class-starter\nid: FW-001\nWhat made it land?\n```'
    ).exercises[0];

    const expected: DailyPagesExercise = {
      kind: 'class-starter',
      prompt: 'What made it land?',
      promptId: 'FW-001',
    };
    expect(idFirst).toEqual(expected);
    expect(kindFirst).toEqual(expected);
  });

  test('reads Daily Pages when the block names it', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nkind: daily-pages\nWhat does Macbeth pay for the crown?\n```'
    );
    expect(exercises[0]!.kind).toBe('daily-pages');
  });

  test('is forgiving about how the kind is written', () => {
    for (const written of [
      'class starter',
      'Class Starter',
      'CLASS-STARTER',
      '  class-starter  ',
    ]) {
      const { exercises } = readDailyPagesExercises(
        '```yawp-daily-pages\nkind: ' + written + '\nWrite.\n```'
      );
      expect(exercises[0]!.kind).toBe('class-starter');
    }
  });

  test('files a block that says nothing as a Class Starter', () => {
    // The two exercises fail in opposite directions. A reflection filed as a
    // Class Starter is graded leniently; a starter filed as Daily Pages marks
    // a student down for depth nobody asked for. So when the planner forgets
    // to say which, the card takes the one that cannot cost a student marks.
    // Blocks written before the kind line existed were freewrite prompts, the
    // library that is Class Starter material since the split.
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nWhat made it land?\n```'
    );
    expect(exercises[0]!.kind).toBe('class-starter');
  });

  test('treats a kind it does not know as a Class Starter rather than dropping the prompt', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nkind: journal\nWhat made it land?\n```'
    );
    expect(exercises[0]).toEqual({
      kind: 'class-starter',
      prompt: 'What made it land?',
      promptId: null,
    });
  });

  test('does not mistake a prompt that merely starts with "kind" for a header', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nKindness costs nothing. Argue the other side.\n```'
    );
    expect(exercises[0]).toEqual({
      kind: 'class-starter',
      prompt: 'Kindness costs nothing. Argue the other side.',
      promptId: null,
    });
  });

  test('keeps the kind line out of the printed packet', () => {
    expect(
      inlineDailyPagesExercises(
        '```yawp-daily-pages\nkind: class-starter\nid: FW-001\nWhat made it land?\n```'
      )
    ).toBe('> What made it land?');
  });
});

describe('which library a prompt came from decides its exercise', () => {
  // The two libraries have disjoint ids: the freewrite library is FW-###, the
  // graded short-form library is sf-…. The id is a fact about the prompt, so
  // it outranks a kind line the model may have got wrong.
  test('files a freewrite library prompt as a Class Starter even with no kind line', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nid: FW-117\nWhat is a rule you would change?\n```'
    );
    expect(exercises[0]!.kind).toBe('class-starter');
  });

  test('files a short-form library prompt as Daily Pages even with no kind line', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nid: sf-ev-03\nWhich line proves it? Explain.\n```'
    );
    expect(exercises[0]!.kind).toBe('daily-pages');
  });

  test('keeps a freewrite prompt a Class Starter when the kind line says Daily Pages', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nkind: daily-pages\nid: FW-001\nWhat made it land?\n```'
    );
    expect(exercises[0]).toEqual({
      kind: 'class-starter',
      prompt: 'What made it land?',
      promptId: 'FW-001',
    });
  });

  test('keeps a short-form prompt Daily Pages when the kind line says Class Starter', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nkind: class-starter\nid: sf-cr-01\nWhat does it cost him?\n```'
    );
    expect(exercises[0]!.kind).toBe('daily-pages');
  });

  // Every id in each library, including any added later, has to read as that
  // library's exercise, or a new prompt quietly loses its protection.
  test('files every freewrite library prompt as a Class Starter', () => {
    expect(freewritePrompts.length).toBeGreaterThan(0);
    for (const prompt of freewritePrompts as Array<{ id: string }>) {
      expect(kindForPromptId(prompt.id)).toBe('class-starter');
    }
  });

  test('files every short-form library prompt as Daily Pages', () => {
    expect(shortFormPrompts.length).toBeGreaterThan(0);
    for (const prompt of shortFormPrompts as Array<{ id: string }>) {
      expect(kindForPromptId(prompt.id)).toBe('daily-pages');
    }
  });

  test('accepts a short-form id, which is lower-case and hyphenated', () => {
    const { exercises } = readDailyPagesExercises(
      '```yawp-daily-pages\nid: sf-dp-05\nWhat did it cost him?\n```'
    );
    expect(exercises[0]!.promptId).toBe('sf-dp-05');
    expect(exercises[0]!.prompt).toBe('What did it cost him?');
  });
});

describe('the words a model reaches for when it names the exercise', () => {
  test.each(['bell-ringer', 'Bell Ringer', 'warm-up', 'warmup', 'starter', 'do now', 'opener'])(
    'reads "%s" as a Class Starter',
    (written) => {
      const { exercises } = readDailyPagesExercises(
        '```yawp-daily-pages\nkind: ' + written + '\nWrite.\n```'
      );
      expect(exercises[0]!.kind).toBe('class-starter');
    }
  );

  test.each(['reflection', 'Daily Page', 'dp'])(
    'reads "%s" as Daily Pages',
    (written) => {
      const { exercises } = readDailyPagesExercises(
        '```yawp-daily-pages\nkind: ' + written + '\nWrite.\n```'
      );
      expect(exercises[0]!.kind).toBe('daily-pages');
    }
  );
});
