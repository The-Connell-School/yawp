import { describe, expect, test } from 'bun:test';
import {
  buildDayRequest,
  buildUnitContext,
  hasUnitPlan,
  inlineUnitPlan,
  markFailedUnitPlans,
  parseRequestedDay,
  readUnitPlan,
  validateUnitPlan,
} from './unit-plan';

function block(body: unknown): string {
  return '```yawp-unit\n' + JSON.stringify(body, null, 2) + '\n```';
}

const threeDays = {
  title: 'Writing the literary analysis paragraph',
  subtitle: 'English 10 · 3 periods',
  endsWith: 'A single analysis paragraph on a passage they choose',
  days: [
    {
      day: 1,
      title: 'What a claim is',
      objective: 'Tell a claim apart from a summary',
      students: 'Sort ten sentences into claim or summary, then argue the ties',
      buildsTo: 'They need a claim before they can support one',
      check: 'Exit ticket: write one claim about the passage',
      minutes: 50,
    },
    {
      day: 2,
      title: 'Evidence that earns its place',
      objective: 'Choose a quote that proves the claim',
      students: 'Match claims to the strongest of three quotes, then justify',
      check: 'Two quote choices with a reason each',
      minutes: 50,
    },
    {
      day: 3,
      title: 'Putting it together',
      objective: 'Draft the full paragraph',
      students: 'Draft, then swap and mark up a partner’s',
      minutes: 50,
    },
  ],
};

describe('readUnitPlan', () => {
  test('lifts the map out of the reply', () => {
    const outcome = readUnitPlan(
      "Here's the arc.\n\n" + block(threeDays) + '\n\nWant me to build day 1?'
    );
    expect(outcome.kind).toBe('unit');
    if (outcome.kind !== 'unit') return;
    expect(outcome.unit.days).toHaveLength(3);
    expect(outcome.unit.title).toBe('Writing the literary analysis paragraph');
    // The JSON never reaches the teacher.
    expect(outcome.body).toBe("Here's the arc.\n\nWant me to build day 1?");
    expect(outcome.body).not.toContain('{');
  });

  test('finds nothing in a reply with no map', () => {
    expect(readUnitPlan('## Warm-up\n\nFour minutes.').kind).toBe('none');
    expect(hasUnitPlan('## Warm-up')).toBe(false);
  });

  test('does not mistake a slide deck for a unit', () => {
    const deck =
      '```yawp-slides\n{"title":"T","slides":[{"layout":"title","title":"T","speakerNotes":"n","minutes":1}]}\n```';
    expect(readUnitPlan(deck).kind).toBe('none');
  });

  test('orders the days the way they will be taught', () => {
    const outcome = readUnitPlan(
      block({
        ...threeDays,
        days: [threeDays.days[2], threeDays.days[0], threeDays.days[1]],
      })
    );
    if (outcome.kind !== 'unit') throw new Error('expected a unit');
    expect(outcome.unit.days.map((day) => day.day)).toEqual([1, 2, 3]);
  });

  test('numbers the days when the model forgot to', () => {
    // It writes them in sequence and leaves the number off far more often than
    // it numbers them wrongly.
    const outcome = readUnitPlan(
      block({
        title: 'A unit',
        days: threeDays.days.map(({ day: _unused, ...rest }) => rest),
      })
    );
    if (outcome.kind !== 'unit') throw new Error('expected a unit');
    expect(outcome.unit.days.map((day) => day.day)).toEqual([1, 2, 3]);
  });

  test('accepts the field names the model reaches for', () => {
    const outcome = readUnitPlan(
      block({
        name: 'A unit',
        finalAssignment: 'An analysis paragraph',
        days: [
          {
            number: 1,
            title: 'Claims',
            goal: 'Tell a claim from a summary',
            activity: 'Sort ten sentences',
            leadsTo: 'Day 2 needs a claim to support',
            assessment: 'One claim on an exit ticket',
          },
        ],
      })
    );
    if (outcome.kind !== 'unit') throw new Error('expected a unit');
    expect(outcome.unit.title).toBe('A unit');
    expect(outcome.unit.endsWith).toBe('An analysis paragraph');
    expect(outcome.unit.days[0]).toMatchObject({
      day: 1,
      objective: 'Tell a claim from a summary',
      students: 'Sort ten sentences',
      buildsTo: 'Day 2 needs a claim to support',
      check: 'One claim on an exit ticket',
    });
  });
});

describe('readUnitPlan — a map that will not render', () => {
  test('strips the block rather than printing braces at a teacher', () => {
    const outcome = readUnitPlan(
      'Here you go.\n\n```yawp-unit\n{"days":[{"day":1}]}\n```'
    );
    expect(outcome.kind).toBe('unreadable');
    if (outcome.kind !== 'unreadable') return;
    expect(outcome.body).toBe('Here you go.');
    expect(outcome.reason).toBeTruthy();
  });

  test('catches a map with no days at all', () => {
    expect(validateUnitPlan('{"title":"T","days":[]}').ok).toBe(false);
  });

  test('catches a paragraph pretending to be a cell', () => {
    const long = 'x'.repeat(400);
    const result = validateUnitPlan(
      JSON.stringify({
        title: 'T',
        days: [{ day: 1, title: 'D', objective: long, students: 'Write' }],
      })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('objective');
  });

  test('says so rather than throwing on malformed JSON', () => {
    const result = validateUnitPlan('{"days": [oops]}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('not valid JSON');
  });

  test('tells the model its map never rendered', () => {
    // Replayed history is the only account it has of what it produced; left as
    // JSON, a rejected map reads back as one that shipped.
    const marked = markFailedUnitPlans(
      'Here you go.\n\n```yawp-unit\n{"days":[{"day":1}]}\n```'
    );
    expect(marked).toContain('failed validation');
    expect(marked).not.toContain('"days"');
  });

  test('leaves a good map alone', () => {
    const reply = 'Here you go.\n\n' + block(threeDays);
    expect(markFailedUnitPlans(reply)).toBe(reply);
  });
});

describe('buildDayRequest', () => {
  test('asks for the day in the teacher’s own words', () => {
    const outcome = readUnitPlan(block(threeDays));
    if (outcome.kind !== 'unit') throw new Error('expected a unit');
    const message = buildDayRequest(outcome.unit, outcome.unit.days[1]!);

    // The day the teacher pointed at, not the planner's recollection of it.
    expect(message).toContain('day 2');
    expect(message).toContain('Evidence that earns its place');
    expect(message).toContain('Choose a quote that proves the claim');
    expect(message).toContain('50 minutes');
    // And it stays inside the arc rather than planning the day in a vacuum.
    expect(message).toContain('day 1');
  });

  test('leaves out what the day did not say', () => {
    const outcome = readUnitPlan(
      block({
        title: 'A unit',
        days: [
          { day: 1, title: 'Claims', objective: 'Spot one', students: 'Sort' },
        ],
      })
    );
    if (outcome.kind !== 'unit') throw new Error('expected a unit');
    expect(buildDayRequest(outcome.unit, outcome.unit.days[0]!)).not.toContain(
      'minutes'
    );
  });
});

describe('inlineUnitPlan', () => {
  test('prints the map as a table rather than a code fence', () => {
    const printed = inlineUnitPlan(block(threeDays));
    expect(printed).not.toContain('```');
    expect(printed).toContain('| Day | Lesson | Objective | Students do |');
    expect(printed).toContain('| 1 (50 min) | What a claim is |');
    expect(printed).toContain('**Ends with:**');
  });

  test('fills the check column when a day has none', () => {
    const printed = inlineUnitPlan(block(threeDays));
    // Day 3 has no check; an empty cell would silently read as "no check
    // needed" rather than "nothing was written here".
    expect(printed).toContain('| — |');
  });

  test('leaves a reply with no map alone', () => {
    const reply = '## Warm-up\n\nFour minutes.';
    expect(inlineUnitPlan(reply)).toBe(reply);
  });
});

describe('parseRequestedDay', () => {
  test('reads the day number back out of a real build-day click', () => {
    const outcome = readUnitPlan(block(threeDays));
    if (outcome.kind !== 'unit') throw new Error('expected a unit');
    const message = buildDayRequest(outcome.unit, outcome.unit.days[1]!);
    expect(parseRequestedDay(message)).toBe(2);
  });

  test('does not match a teacher’s own free-typed request', () => {
    // A coincidental "build day 2" from the teacher is not the button, and
    // guessing at unit context from it would be worse than adding none.
    expect(parseRequestedDay('Can you build day 2 for me?')).toBeNull();
    expect(parseRequestedDay('build day 2')).toBeNull();
  });

  test('is not fooled by the day number alone', () => {
    expect(parseRequestedDay('Day 2 needs more scaffolding.')).toBeNull();
  });
});

describe('buildUnitContext', () => {
  const outcome = readUnitPlan(block(threeDays));
  if (outcome.kind !== 'unit') throw new Error('expected a unit');
  const { unit } = outcome;

  test('gives a middle day both neighbours', () => {
    const context = buildUnitContext(unit, 2);
    expect(context).not.toBeNull();
    expect(context!.day.title).toBe('Evidence that earns its place');
    expect(context!.previous?.title).toBe('What a claim is');
    expect(context!.next?.title).toBe('Putting it together');
    expect(context!.totalDays).toBe(3);
    expect(context!.endsWith).toBe(
      'A single analysis paragraph on a passage they choose'
    );
  });

  test('day one has no day before it', () => {
    const context = buildUnitContext(unit, 1);
    expect(context!.previous).toBeNull();
    expect(context!.next?.title).toBe('Evidence that earns its place');
  });

  test('the last day has no day after it', () => {
    const context = buildUnitContext(unit, 3);
    expect(context!.next).toBeNull();
    expect(context!.previous?.title).toBe('Evidence that earns its place');
  });

  test('a day outside the unit gets no context rather than a guess', () => {
    expect(buildUnitContext(unit, 9)).toBeNull();
  });
});
