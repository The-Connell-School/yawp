import { describe, expect, test } from 'bun:test';
import {
  artifactFromAssistantReply,
  DAILY_PAGES_BLOCK_KEY,
  dailyPagesBlockKey,
  exerciseAsMaterial,
  exitTicketAsMaterial,
} from './artifact-from-reply';
import { EXIT_TICKET_CONFIG_SCHEMA_VERSION } from '~/domain/assignment-types/exit-ticket';
import { EXIT_TICKET_BLOCK_KEY } from './lesson-material';

describe('exitTicketAsMaterial', () => {
  test('files the student prompt as an exit-ticket handout', () => {
    const material = exitTicketAsMaterial({
      config: {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'specific',
        focus: 'explain-concept',
        topic: 'comma splices',
        answerType: 'objective',
        lessonNotes: {
          mainPoints: 'x',
          mustMention: 'y',
          watchFor: 'z',
        },
      },
      prompt: 'Explain what a comma splice is.',
      graded: false,
      pointValue: null,
    });
    expect(material.kind).toBe('exit-ticket');
    expect(material.slot).toBe(EXIT_TICKET_BLOCK_KEY);
    expect(material.content).toContain('comma splice');
  });
});

describe('artifactFromAssistantReply', () => {
  test('reads a yawp-exit-ticket block from the reply', () => {
    const reply =
      '## Closing\n\n```yawp-exit-ticket\nmode: specific\nfocus: explain-concept\ntopic: weathering and erosion\nanswer: objective\n```';
    const material = artifactFromAssistantReply(reply, EXIT_TICKET_BLOCK_KEY);
    expect(material?.kind).toBe('exit-ticket');
    expect(material?.content).toContain('weathering and erosion');
  });
});

describe("class starters and Daily Pages go in the stack (Brian's review, B1)", () => {
  const reply =
    '## Class starter (8 min)\n\nPick one:\n\n' +
    '```yawp-daily-pages\nid: FW-001\nThink of the last time you tried to convince someone of something.\n```\n\n' +
    '```yawp-daily-pages\nkind: class-starter\nWrite about something you carry every day.\n```\n\n' +
    '## Daily Pages (15 min)\n\n' +
    '```yawp-daily-pages\nkind: daily-pages\nWhat does the list form let O\'Brien do that a story could not?\n```';

  test('keys each exercise by its position, short enough for the packet API', () => {
    expect(DAILY_PAGES_BLOCK_KEY).toBe('dp');
    expect(dailyPagesBlockKey(0)).toBe('dp');
    expect(dailyPagesBlockKey(2)).toBe('dp:2');
    expect(dailyPagesBlockKey(12).length).toBeLessThanOrEqual(8);
  });

  test('files the second class starter as its own piece', () => {
    const material = artifactFromAssistantReply(reply, 'dp:1');
    expect(material).not.toBeNull();
    expect(material!.kind).toBe('class-starter');
    expect(material!.audience).toBe('student');
    expect(material!.content).toContain('something you carry');
    expect(material!.title.startsWith('Class Starter:')).toBe(true);
  });

  test('files a Daily Pages reflection as Daily Pages', () => {
    const material = artifactFromAssistantReply(reply, 'dp:2');
    expect(material!.kind).toBe('daily-pages');
    expect(material!.title.startsWith('Daily Pages:')).toBe(true);
  });

  test('gives every prompt its own slot, so three options are three pieces', () => {
    const slots = ['dp', 'dp:1', 'dp:2'].map(
      (key) => artifactFromAssistantReply(reply, key)!.slot
    );
    expect(new Set(slots).size).toBe(3);
  });

  test('keeps the library id as data, never in the text (Brian\'s run 2)', () => {
    const material = exerciseAsMaterial(
      { kind: 'class-starter', prompt: 'Think of the last time…', promptId: 'FW-001' },
      'dp'
    );
    expect(material.promptId).toBe('FW-001');
    expect(material.content).not.toContain('FW-001');
    expect(material.title).not.toContain('FW-001');
  });

  test('returns null for an exercise that is not there', () => {
    expect(artifactFromAssistantReply(reply, 'dp:7')).toBeNull();
  });
});

describe("artifactFromAssistantReply — a lesson step (Brian's run 2, A3)", () => {
  const plan =
    '## Read aloud (20 min)\n\nIf you like reading aloud yourself, take the first pages.\n\n## Pair talk (8 min)\n\nPairs compare one item.';

  test('files one step as a teacher-facing lesson step, titled with its minutes', () => {
    const step = artifactFromAssistantReply(plan, 'st:1');
    expect(step).toMatchObject({
      key: 'st:1',
      kind: 'step',
      audience: 'teacher',
      title: 'Pair talk (8 min)',
      content: 'Pairs compare one item.',
      slot: 'step:pair-talk',
    });
  });

  test('null for a step that is not there', () => {
    expect(artifactFromAssistantReply(plan, 'st:5')).toBeNull();
  });
});

describe("artifactFromAssistantReply — writing practice (Brian's run 2, A3)", () => {
  const reply =
    '## Practice (10 min)\n\nFix a few.\n\n```yawp-practice\nlessons: comma-splices\nproblems: 6\n---\nFix each sentence.\n```';

  test('files the practice set as a piece of the lesson', () => {
    const piece = artifactFromAssistantReply(reply, 'pr');
    expect(piece).toMatchObject({
      key: 'pr',
      kind: 'practice',
      audience: 'teacher',
      slot: 'practice:comma-splices',
    });
    expect(piece!.title).toBe('Writing practice: Comma splices');
    expect(piece!.content).toContain('6 problems from Comma splices');
    expect(piece!.content).toContain('Fix each sentence.');
  });
});
