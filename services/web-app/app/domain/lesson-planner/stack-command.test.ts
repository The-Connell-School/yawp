import { describe, expect, test } from 'bun:test';
import {
  checkOps,
  fencePiece,
  findStep,
  quickCommand,
  readCommandResult,
  STACK_COMMAND_SYSTEM,
  type CommandStep,
} from './stack-command';
import { readLessonMaterials } from './lesson-material';
import { readPlannedExitTickets } from './exit-ticket-block';
import { readDailyPagesExercises } from './daily-pages-block';
import { stackCreateLink } from './stack-create-link';

const STEPS: CommandStep[] = [
  { id: 'starter', title: 'Four minutes of writing, then a share', type: 'class_starter', minutes: 5, isWriting: true },
  { id: 'hook', title: 'Hook activity: What’s in your bag?', type: 'activity', minutes: 15, isWriting: false },
  { id: 'hist', title: 'Frame — Historical context', type: 'context', minutes: 4, isWriting: false },
  { id: 'auth', title: 'Frame — The author', type: 'context', minutes: 3, isWriting: false },
  { id: 'read', title: 'Read aloud: the opening of the title story', type: 'read_aloud', minutes: 12, isWriting: false },
  { id: 'close', title: 'Closing', type: 'closing', minutes: 3, isWriting: false },
];

describe('quickCommand: the common changes need no model (Kevin’s note, run 3 item 7)', () => {
  test('"shorten the hook to 10 minutes"', () => {
    expect(quickCommand('shorten the hook to 10 minutes', STEPS)).toEqual({
      reply: 'Hook activity: What’s in your bag? set to 10 min.',
      ops: [{ op: 'set_minutes', stepId: 'hook', minutes: 10 }],
      pieces: [],
    });
  });

  test('words and other verbs', () => {
    expect(quickCommand('Make the read aloud fifteen min', STEPS)?.ops).toEqual([
      { op: 'set_minutes', stepId: 'read', minutes: 15 },
    ]);
    expect(quickCommand('remove the closing', STEPS)?.ops).toEqual([{ op: 'remove', stepId: 'close' }]);
  });

  test('an unclear step goes to the model rather than guessing', () => {
    expect(findStep('frame', STEPS)).toBeNull();
    expect(quickCommand('shorten the frame to 2 minutes', STEPS)).toBeNull();
    expect(quickCommand('make the closing two sentences', STEPS)).toBeNull();
  });
});

describe('checkOps', () => {
  test('drops ops on steps that are not in this stack, and clamps minutes', () => {
    expect(
      checkOps(
        [
          { op: 'set_minutes', stepId: 'nope', minutes: 5 },
          { op: 'set_minutes', stepId: 'hook', minutes: 900 },
        ],
        STEPS,
        'longer hook'
      )
    ).toEqual([{ op: 'set_minutes', stepId: 'hook', minutes: 120 }]);
  });

  test('never cuts writing unless the teacher names it', () => {
    const cut = [
      { op: 'set_minutes' as const, stepId: 'starter', minutes: 2 },
      { op: 'remove' as const, stepId: 'starter' },
    ];
    expect(checkOps(cut, STEPS, 'get me back on time')).toEqual([]);
    expect(checkOps(cut, STEPS, 'cut the class starter')).toHaveLength(2);
  });
});

test('a model answer is read only when it is the right shape', () => {
  expect(readCommandResult('{"reply":"Done.","ops":[{"op":"remove","stepId":"hook"}]}')).toEqual({
    reply: 'Done.',
    ops: [{ op: 'remove', stepId: 'hook' }],
    pieces: [],
  });
  expect(readCommandResult('sure!')).toBeNull();
  expect(readCommandResult('{"reply":"x","ops":[{"op":"explode"}]}')).toBeNull();
});

test('a proposed piece travels as a material block the stack can file', () => {
  const block = fencePiece({ title: 'Turn and talk', minutes: 5, type: 'activity', text: 'Pairs pick one item.' });
  const { materials } = readLessonMaterials(block);
  expect(materials[0]).toMatchObject({ title: 'Turn and talk', minutes: 5, stepType: 'activity', audience: 'teacher' });
});

describe("writing from the stack chat is a Yawp! assignment (Brian's run 5, item 6)", () => {
  test('an exit ticket files as a Yawp! exit ticket, with its title, minutes and question', () => {
    const block = fencePiece({
      title: 'What the conch means',
      minutes: 5,
      type: 'closing',
      text: 'In two sentences: what does the conch stand for by the end of chapter 2?',
      writing: 'exit_ticket',
    });
    const ticket = readPlannedExitTickets(block).tickets[0]!;
    expect(ticket.minutes).toBe(5);
    expect(ticket.prompt).toContain('what does the conch stand for');
    const link = stackCreateLink({
      kind: 'exit-ticket',
      content: ticket.prompt,
      blockKey: 'ticket',
      sourceContent: block,
      typeIds: { dailyPages: 'dp', classStarter: 'cs', exitTicket: 'et' },
      conversationId: 'plan-1',
    });
    expect(link?.label).toBe('Create this exit ticket in Yawp!');
  });

  test('a reflection or quick write files as a class starter; Daily Pages as Daily Pages', () => {
    const quick = readDailyPagesExercises(
      fencePiece({ title: 'Pre-write', minutes: 4, type: 'activity', text: 'Who should lead, and why?', writing: 'quick_write' })
    ).exercises[0]!;
    expect(quick.kind).toBe('class-starter');
    expect(quick.minutes).toBe(4);
    const pages = readDailyPagesExercises(
      fencePiece({ title: 'Daily Pages', minutes: 10, type: 'daily_pages', text: 'Write about an island of your own.', writing: 'daily_pages' })
    ).exercises[0]!;
    expect(pages.kind).toBe('daily-pages');
  });

  test('the stack chat is told so, and never to use sticky notes or scrap paper', () => {
    expect(STACK_COMMAND_SYSTEM).toContain('created as a Yawp! assignment');
    expect(STACK_COMMAND_SYSTEM).toContain('Never set students writing on a sticky note');
  });
});
