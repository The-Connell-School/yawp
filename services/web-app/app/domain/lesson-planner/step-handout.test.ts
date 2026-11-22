import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileableMaterial } from './fileable-material';
import { pieceKeysInReply } from './reply-pieces';
import {
  answerLinesFor,
  handoutContent,
  handoutPages,
  handoutPlan,
  isStudentFacing,
  passageFirst,
  studentVersionKey,
  STUDENT_VERSION_SYSTEM,
} from './step-handout';

describe("handouts for any step (Brian's run 3, item 8)", () => {
  test('what students already hold prints as it is; a teacher step needs its student version', () => {
    expect(isStudentFacing('class-starter')).toBe(true);
    expect(isStudentFacing('step')).toBe(false);
    expect(handoutContent({ kind: 'daily-pages', content: 'Write.' }, null)).toBe('Write.');
    expect(handoutContent({ kind: 'step', content: 'Push a little.' }, null)).toBeNull();
    expect(handoutContent({ kind: 'step', content: 'Push a little.' }, 'Pick one object.')).toBe('Pick one object.');
  });

  test('answer lines sized to the writing', () => {
    expect(answerLinesFor({ isWriting: true, minutes: 5, type: 'class_starter', kind: 'class-starter' })).toBe(8);
    expect(answerLinesFor({ isWriting: true, minutes: 15, type: 'daily_pages', kind: 'daily-pages' })).toBe(20);
    expect(answerLinesFor({ isWriting: false, minutes: 3, type: 'closing', kind: 'step' })).toBe(5);
    expect(answerLinesFor({ isWriting: false, minutes: 15, type: 'activity', kind: 'step' })).toBe(0);
  });

  test('a changed step gets a new version key', () => {
    expect(studentVersionKey('a')).not.toBe(studentVersionKey('b'));
  });

  test('the student version leaves teacher moves out', () => {
    expect(STUDENT_VERSION_SYSTEM).toContain('Leave out every teacher move');
    expect(STUDENT_VERSION_SYSTEM).toContain('"push a little"');
  });
});

describe('the handout packet is the lesson’s own tasks, once each (Nov 22 review)', () => {
  const fixture = (name: string) => readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8');
  const MACBETH = fixture('printables-macbeth-reply.md');

  /** The stack "Add everything" made from the reply: every piece, as filed. */
  function stackOf(content: string, messageId = 'msg1') {
    return pieceKeysInReply(content).flatMap((key, index) => {
      const material = fileableMaterial(content, key);
      return material && material.kind !== 'slides'
        ? [{ id: `m${index}`, kind: material.kind, title: material.title, token: `${messageId}:${key}`, content: material.content }]
        : [];
    });
  }

  test('a step whose task is its own blocks (the starters, the prompt, the ticket) is not a page of its own', () => {
    const pieces = stackOf(MACBETH);
    const plan = handoutPlan(pieces, { msg1: MACBETH });
    const covered = pieces.filter((piece) => plan.covered.has(piece.id)).map((piece) => piece.title);
    expect(covered).toEqual(['Class starter (5 min)', 'Short response (12 min)', 'Closing (4 min)']);
    // The steps with no block of their own are still theirs to print.
    expect(pieces.filter((piece) => /Close reading/.test(piece.title)).every((piece) => !plan.covered.has(piece.id))).toBe(true);
  });

  test('a step is not covered by blocks the teacher took out of the stack', () => {
    const pieces = stackOf(MACBETH).filter((piece) => piece.kind !== 'exit-ticket');
    const plan = handoutPlan(pieces, { msg1: MACBETH });
    expect(pieces.filter((piece) => plan.covered.has(piece.id)).map((piece) => piece.title)).not.toContain('Closing (4 min)');
  });

  test('a teacher’s own step, or one from a reply that is gone, is never covered', () => {
    const plan = handoutPlan([{ id: 'x', kind: 'step', token: null }, { id: 'y', kind: 'step', token: 'gone:st' }], {});
    expect(plan.covered.size).toBe(0);
  });

  test('three class-starter options print as one page: "choose one", the plan’s own prompts', () => {
    const pieces = stackOf(MACBETH);
    const plan = handoutPlan(pieces, { msg1: MACBETH });
    const parts = pieces
      .filter((piece) => !plan.covered.has(piece.id) && piece.kind !== 'step')
      .map((piece) => ({ id: piece.id, title: piece.title.replace(/^Class Starter:\s*/i, ''), content: piece.content, lines: 6 }));
    const pages = handoutPages(parts, plan);
    expect(pages.map((page) => page.title)).toEqual(['Class starter', 'Short Response: What ambition costs', expect.stringMatching(/^Exit ticket/)]);
    const starter = pages[0]!;
    expect(starter.content).toContain('Choose one');
    expect(starter.content).toContain('I am the captain of my destiny.');
    expect(starter.content).toContain("We don't choose what we want — we only choose whether to chase it.");
    expect(starter.content).toContain('Free will is an illusion we need in order to function.');
    expect(starter.content).not.toMatch(/stayed quiet|Quick Write/);
    expect(starter.lines).toBe(6);
  });

  test('the packet for the Macbeth stack: no invented starter, one Short Response, one exit ticket', () => {
    const pieces = stackOf(MACBETH);
    const plan = handoutPlan(pieces, { msg1: MACBETH });
    const printed = handoutPages(
      pieces
        .filter((piece) => !plan.covered.has(piece.id) && isStudentFacing(piece.kind))
        .map((piece) => ({ id: piece.id, title: piece.title, content: piece.content, lines: 4 })),
      plan
    );
    const text = printed.map((page) => `${page.title}\n${page.content}`).join('\n');
    expect(text.match(/Ambition costs something/g)?.length).toBe(1);
    expect(text).not.toContain('What does this moment reveal about the character');
    expect(printed.filter((page) => /exit/i.test(page.title))).toHaveLength(1);
  });
});

describe('a passage prints above its questions', () => {
  test('questions first, then the passage: the passage moves up, with its source line', () => {
    const page = passageFirst(
      [
        '## The aside',
        '',
        '**1.** What two possibilities is Macbeth weighing?',
        '',
        '**2.** What has already come true?',
        '',
        '> This supernatural soliciting',
        '> Cannot be ill, cannot be good.',
        '',
        '— William Shakespeare, *Macbeth*, 1.3',
      ].join('\n')
    );
    expect(page.indexOf('This supernatural soliciting')).toBeLessThan(page.indexOf('What two possibilities'));
    expect(page.indexOf('— William Shakespeare')).toBeLessThan(page.indexOf('What two possibilities'));
    expect(page.startsWith('## The aside')).toBe(true);
  });

  test('a handout already in order is left exactly as written', () => {
    const written = readFileSync(join(import.meta.dir, 'fixtures', 'printables-macbeth-handout-reply.md'), 'utf8');
    expect(passageFirst(written)).toBe(written);
    expect(passageFirst('Write about a time you changed your mind?')).toBe('Write about a time you changed your mind?');
  });

  test('a filed handout prints passage first', () => {
    expect(handoutContent({ kind: 'handout', content: '1. What does he fear?\n\n> Present fears\n> Are less than horrible imaginings.' }, null)).toBe(
      '> Present fears\n> Are less than horrible imaginings.\n\n1. What does he fear?'
    );
  });

  test('the student version never invents a prompt or a passage, and puts the passage first', () => {
    expect(STUDENT_VERSION_SYSTEM).toContain('Never invent a prompt');
    expect(STUDENT_VERSION_SYSTEM).toContain('passage first');
  });
});

describe('passageFirst leaves a lead-in alone', () => {
  test('a question before the passage that is not a numbered task stays above it', () => {
    const page = 'Before you read: what do you expect?\n\n> Present fears\n> Are less than horrible imaginings.\n\n1. What does he fear?';
    expect(passageFirst(page)).toBe(page);
  });
});

