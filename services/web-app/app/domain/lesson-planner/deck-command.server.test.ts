import { afterAll, describe, expect, mock, test } from 'bun:test';
import type { SlideDeck } from './slide-deck';

mock.module('./planner-completion.server', () => ({ plannerComplete: mock() }));
const { runDeckCommand } = await import('./deck-command.server');
afterAll(() => mock.restore());

const DECK: SlideDeck = {
  title: 'Sudan before the novel',
  kit: 'v4.1',
  slides: [
    { layout: 'title', title: 'Sudan before the novel', speakerNotes: 'Open.' },
    { layout: 'discuss', title: 'Why the Nile?', question: 'Why would the river matter to an empire?', speakerNotes: 'Listen.' },
    { layout: 'bullets', title: 'Words to know', bullets: ['Condominium'], speakerNotes: 'Quick.' },
  ],
};
const access = { membership: { id: 'teacher-1', organization: { id: 'org-1', numOfTeacherSeats: 5 } } };
const request = new Request('http://localhost/api/domain/lesson-planner/deck-command', { method: 'POST' });

function run(answer: string | Error, extra: Partial<Parameters<typeof runDeckCommand>[0]> = {}) {
  const complete = mock(async () => {
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { complete, outcome: runDeckCommand({ request, access, deck: DECK, line: 'Cut the vocabulary slide', selection: null, periodMinutes: 45, complete, ...extra }) };
}

describe('runDeckCommand', () => {
  test('a good answer: the changed deck, in the look it came in, with what changed', async () => {
    const { complete, outcome } = run('{"reply": "Cut the vocabulary slide.", "ops": [{"op": "remove_slide", "slide": 3}]}');
    expect(await outcome).toMatchObject({
      reply: 'Cut the vocabulary slide.',
      applied: true,
      changes: [{ slide: 3, kind: 'removed', title: 'Words to know' }],
    });
    const deck = (await outcome).deck!;
    expect(deck.slides).toHaveLength(2);
    expect(deck.kit).toBe('v4.1');

    const call = (complete.mock.calls[0] as unknown[])[0] as { system: string; user: string; feature: string; maxTokens: number };
    expect(call.feature).toBe('lesson-planner-deck-command');
    expect(call.user).toContain('Cut the vocabulary slide');
    expect(call.user).toContain('"number": 3');
    // The school's deck spec: v4.1.
    expect(call.system).toContain('Lesson Deck Kit, spec v4.1');
    expect(call.system).toContain('replace_slide');
  });

  test('a deck drawn in spec v4 is edited to spec v4’s rules', async () => {
    const { complete, outcome } = run('{"reply": "Nothing to change."}', { deck: { ...DECK, kit: 'v4' } });
    await outcome;
    const call = (complete.mock.calls[0] as unknown[])[0] as { system: string };
    expect(call.system).toContain('Lesson Deck Kit, spec v4)');
    expect(call.system).not.toContain('spec v4.1');
  });

  test('what is pointed at goes to the model with the line', async () => {
    const { complete, outcome } = run('{"reply": "ok"}', { selection: { slide: 2, field: 'question', text: 'Why would the river matter to an empire?' } });
    await outcome;
    const call = (complete.mock.calls[0] as unknown[])[0] as { user: string };
    expect(call.user).toContain('pointing at slide 2, its question');
  });

  test('an answer with nothing to do says so and changes nothing', async () => {
    expect(await run('{"reply": "I can’t make pictures here."}').outcome).toEqual({ reply: 'I can’t make pictures here.', applied: false, changes: [] });
  });

  test('an answer that cannot be read, or would break the deck, leaves it alone', async () => {
    const unreadable = await run('I would love to help!').outcome;
    expect(unreadable.applied).toBe(false);
    expect(unreadable.reply).toContain('couldn’t make that change');
    const broken = await run('{"reply": "Done.", "ops": [{"op": "replace_slide", "slide": 2, "with": {"layout": "big_idea", "title": "Idea"}}]}').outcome;
    expect(broken).toEqual({ reply: unreadable.reply, applied: false, changes: [] });
    const missing = await run('{"reply": "Done.", "ops": [{"op": "remove_slide", "slide": 9}]}').outcome;
    expect(missing.applied).toBe(false);
  });

  test('ops that change nothing are not a change', async () => {
    const same = await run(`{"reply": "It already says that.", "ops": [{"op": "replace_slide", "slide": 1, "with": ${JSON.stringify(DECK.slides[0])}}]}`).outcome;
    expect(same).toEqual({ reply: 'It already says that.', applied: false, changes: [] });
  });

  test('a rate limit is the route’s to answer', async () => {
    const limit = new Error('too many');
    await expect(run(limit).outcome).rejects.toBe(limit);
  });
});
