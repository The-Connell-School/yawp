import { describe, expect, test } from 'bun:test';
import { lessonBackHref, stackCreateLink } from './stack-create-link';

const typeIds = { dailyPages: 'dp-type', classStarter: 'cs-type', exitTicket: 'et-type' };

describe("stackCreateLink (Brian's run 2, A5)", () => {
  test('a class starter goes to the Class Starter sheet with its prompt', () => {
    const link = stackCreateLink({
      kind: 'class-starter',
      content: 'Write about something you carry.',
      blockKey: 'dp',
      sourceContent: null,
      typeIds,
      conversationId: 'plan-1',
    });
    expect(link?.label).toBe('Create this class starter in Yawp!');
    expect(link?.href).toContain('/app/assignment-types/cs-type?');
    expect(link?.href).toContain('newPrompt=Write+about+something+you+carry.');
    expect(link?.href).toContain('fromLesson=plan-1');
    expect(link?.href).toContain('back=stack');
  });

  test('a Daily Pages prompt goes to Daily Pages, without any old id footer', () => {
    const link = stackCreateLink({
      kind: 'daily-pages',
      content: 'Explain your claim.\n\n_Daily Pages prompt sf-ev-03_',
      blockKey: 'dp:1',
      sourceContent: null,
      typeIds,
      conversationId: 'plan-1',
    });
    expect(link?.label).toBe('Create this Daily Pages prompt in Yawp!');
    expect(link?.href).toContain('/app/assignment-types/dp-type?');
    expect(decodeURIComponent(link!.href)).not.toContain('sf-ev-03');
  });

  test('an exit ticket is rebuilt from the reply it came from', () => {
    const link = stackCreateLink({
      kind: 'exit-ticket',
      content: 'What weighed nothing?',
      blockKey: 'ticket:1',
      sourceContent:
        '```yawp-exit-ticket\nmode: basic\n```\n\n```yawp-exit-ticket\nmode: specific\nfocus: explain-concept\ntopic: weight\nanswer: objective\n```',
      typeIds,
      conversationId: 'plan-1',
    });
    expect(link?.label).toBe('Create this exit ticket in Yawp!');
    expect(link?.href).toContain('/app/assignment-types/et-type');
    expect(decodeURIComponent(link!.href)).toContain('weight');
  });

  test('nothing for a handout, or when the school has no such assignment', () => {
    expect(
      stackCreateLink({
        kind: 'handout',
        content: 'Read.',
        blockKey: '0',
        sourceContent: null,
        typeIds,
        conversationId: 'plan-1',
      })
    ).toBeNull();
    expect(
      stackCreateLink({
        kind: 'class-starter',
        content: 'Write.',
        blockKey: 'dp',
        sourceContent: null,
        typeIds: { ...typeIds, classStarter: null },
        conversationId: 'plan-1',
      })
    ).toBeNull();
  });
});

describe("stackCreateLink — every writing step (Brian's run 3, item 4)", () => {
  const base = { blockKey: 'st:5', sourceContent: null, typeIds, conversationId: 'plan-1' };

  test('a closing with an exit ticket written in prose gets the exit ticket sheet', () => {
    const link = stackCreateLink({
      ...base,
      kind: 'step',
      title: 'Closing (3 min)',
      content: 'Exit ticket: one object, one sentence about why it matters.',
    });
    expect(link?.label).toBe('Create this exit ticket in Yawp!');
    expect(link?.href).toContain('/app/assignment-types/et-type?');
    expect(decodeURIComponent(link!.href.replace(/\+/g, ' '))).toContain(
      'one object, one sentence about why it matters'
    );
  });

  test('a quick write in a step goes to the Class Starter sheet', () => {
    const link = stackCreateLink({
      ...base,
      kind: 'step',
      title: 'Quick write (4 min)',
      content: 'Students write for four minutes: "What is the heaviest thing you carry?"',
    });
    expect(link?.label).toBe('Create this quick write in Yawp!');
    expect(decodeURIComponent(link!.href.replace(/\+/g, ' '))).toContain('newPrompt=What is the heaviest thing you carry?');
  });

  test('a step where nobody writes has no button', () => {
    expect(
      stackCreateLink({ ...base, kind: 'step', title: 'Hook (15 min)', content: 'Pairs share one object.' })
    ).toBeNull();
  });

  test('a Thesis Essay module goes to the thesis sheet', () => {
    const link = stackCreateLink({
      ...base,
      kind: 'step',
      stepType: 'thesis_essay',
      title: 'Finding a claim (15 min)',
      content: 'Students draft a working claim: what is this book really about?',
      typeIds: { ...typeIds, thesis: 'th-type' },
    });
    expect(link?.label).toBe('Create this Thesis Essay assignment in Yawp!');
    expect(link?.href).toContain('/app/assignment-types/th-type?');
  });

  test('the link says which piece it came from, so creating it can be remembered', () => {
    const link = stackCreateLink({
      ...base,
      kind: 'class-starter',
      content: 'Write.',
      materialId: 'mat-9',
    });
    expect(link?.href).toContain('fromPiece=m%3Amat-9');
  });

  test('once created: "Created in Yawp! · Open"', () => {
    const link = stackCreateLink({
      ...base,
      kind: 'class-starter',
      content: 'Write.',
      created: { href: '/app/assignment-types/cs-type' },
    });
    expect(link).toEqual({ label: 'Created in Yawp! · Open', href: '/app/assignment-types/cs-type', created: true });
  });
});

describe("lessonBackHref (Brian's run 4, item 4)", () => {
  test('from the stack page: back to the run of show', () => {
    expect(lessonBackHref('plan-1', 'stack')).toBe('/app/lesson-planner/plan-1/packet');
  });
  test('from the chat: back to the chat', () => {
    expect(lessonBackHref('plan-1', null)).toBe('/app/lesson-planner?c=plan-1');
  });
});

describe("reflections and pre-writes can be made in Yawp! (Brian's run 5, item 6)", () => {
  const typeIds = { dailyPages: 'dp', classStarter: 'cs', exitTicket: 'et' };
  test('a pre-write or a written reflection offers a quick write', () => {
    for (const content of ['Pre-write: who should lead the boys, and why?', 'A written reflection: what changed in Ralph today?']) {
      const link = stackCreateLink({ kind: 'step', title: 'Wrap-up', content, blockKey: 'st', sourceContent: null, typeIds, conversationId: 'plan-1' });
      expect(link?.label).toBe('Create this quick write in Yawp!');
    }
  });
});

test("the writing moments from Brian's week offer a Yawp! quick write (run 5, round 2)", () => {
  const typeIds = { dailyPages: 'dp', classStarter: 'cs', exitTicket: 'et' };
  for (const content of [
    'Hook: a one-sentence written answer to "When do rules matter?"',
    'Class starter: 90 seconds of writing on the conch.',
    'Closing: students write one sentence in their notes about Ralph.',
  ]) {
    const link = stackCreateLink({ kind: 'step', title: 'Step', content, blockKey: 'st', sourceContent: null, typeIds, conversationId: 'plan-1' });
    expect(link?.label).toBe('Create this quick write in Yawp!');
  }
});
