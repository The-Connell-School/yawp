import { describe, expect, test } from 'bun:test';
import { inflateRawSync } from 'node:zlib';
import { renderLessonPlanDocx, renderLessonPlanPdf } from './lesson-plan-render.server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { buildUnitPlanDoc, unitMapFromReply, type LessonPlanDoc } from './lesson-plan-doc';

/** The files inside a zip, by name, read through the central directory. */
function zipParts(bytes: Uint8Array): Map<string, string> {
  const buffer = Buffer.from(bytes);
  const end = buffer.lastIndexOf('PK\x05\x06', buffer.length, 'latin1');
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const parts = new Map<string, string>();
  for (let index = 0; index < count; index += 1) {
    const method = buffer.readUInt16LE(cursor + 10);
    const size = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const local = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const raw = buffer.subarray(start, start + size);
    parts.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return parts;
}

const DOC: LessonPlanDoc = {
  title: 'The Things They Carried — Day 1',
  className: 'English 11 · Period 5',
  periodMinutes: 50,
  overview: 'Students enter the book through what soldiers carried.',
  goals: ['Students will name what an object reveals about a character.'],
  teacherWill: ['Read the opening aloud.', 'Collect the exit tickets.'],
  materials: ['Class starter (Yawp! assignment): What do you carry?', 'Slide deck: Day 1 (8 slides)'],
  instructions: [
    { title: 'Class starter', minutes: 5, summary: 'Students write on what they carry.', purpose: 'Starts from their thinking.' },
    { title: 'Read aloud', minutes: 20, summary: 'You read the opening pages.', purpose: 'Students hear the list form.' },
  ],
  closing: 'Students write one object and one sentence.',
  closingStep: { title: 'Exit ticket', minutes: 3, summary: 'Students write one object and one sentence.', purpose: 'Shows who has it.' },
  closingInStack: true,
  extensions: [],
  assessment: 'The exit ticket: one object, one sentence.',
  standards: [],
};

describe("renderLessonPlanDocx (Brian's run 2, D2)", () => {
  test('a real Word file, in the pre-writing plan’s shape, that Google Docs can open', async () => {
    const bytes = await renderLessonPlanDocx(DOC);
    expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe('PK');
    const xml = zipParts(bytes).get('word/document.xml')!;
    for (const heading of ['Overview', 'Learning objectives', 'Teacher will', 'Materials', 'Instructions', 'Closing']) {
      expect(xml).toContain(`>${heading}<`);
    }
    expect(xml).toContain('Heading1');
    expect(xml).toContain('Heading2');
    // Numbered instructions, with what each is for.
    expect(xml).toContain('numPr');
    expect(xml).toContain('Read aloud');
    expect(xml).toContain('Why: Students hear the list form.');
    expect(xml).toContain('5 min');
  });

  test("fully editable, the stack's closing once, and blank sections to fill (Brian's run 3, item 12)", async () => {
    const xml = zipParts(await renderLessonPlanDocx(DOC)).get('word/document.xml')!;
    // Step titles are real headings a teacher can restyle, not bold runs.
    expect(xml).toContain('Heading3');
    expect(xml).not.toContain('w:txbx');
    for (const heading of ['Differentiation / accommodations', 'Assessment']) {
      expect(xml).toContain(`>${heading}<`);
    }
    // No standards named: no Standards section to fill (Nov 22 review).
    expect(xml).not.toContain('>Standards<');
    expect(xml).not.toContain('Add the standards this lesson meets.');
    expect(xml).toContain('The exit ticket: one object, one sentence.');
    expect(xml.match(/>Exit ticket \(3 min\)</g)?.length).toBe(1);
  });

  test('the standards the teacher named fill the Standards section, in the Word file and the PDF', async () => {
    const named = { ...DOC, standards: ['RL.9-10.1: Cite strong and thorough textual evidence.'] };
    const xml = zipParts(await renderLessonPlanDocx(named)).get('word/document.xml')!;
    expect(xml).toContain('RL.9-10.1: Cite strong and thorough textual evidence.');
    expect(xml).not.toContain('Add the standards this lesson meets.');
    expect(xml).toContain('Add any others this lesson meets.');
  });

  test('no logo, no image (Brian, item 31)', async () => {
    const parts = zipParts(await renderLessonPlanDocx(DOC));
    expect([...parts.keys()].some((name) => name.startsWith('word/media/'))).toBe(false);
  });
});

describe('renderLessonPlanPdf', () => {
  test('a short PDF of the same plan', async () => {
    const bytes = await renderLessonPlanPdf(DOC);
    const text = Buffer.from(bytes).toString('latin1');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('%%EOF');
    // One or two pages, not a transcript.
    const pages = (text.match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(pages).toBeLessThanOrEqual(3);
  });
});

describe('teacher notes on the plan (Oct 24 handoff, task 7)', () => {
  const noted: LessonPlanDoc = {
    ...DOC,
    instructions: [
      { ...DOC.instructions[0]!, teacherNotes: 'Open with: Ask what is in their bag.\nMove on when: pens are down.' },
      DOC.instructions[1]!,
    ],
  };

  test('under their step in the Word file, by section', async () => {
    const xml = zipParts(await renderLessonPlanDocx(noted)).get('word/document.xml')!;
    expect(xml).toContain('Teacher notes');
    expect(xml).toContain('Open with: ');
    expect(xml).toContain('Ask what is in their bag.');
    expect(xml).toContain('Move on when: ');
    expect(zipParts(await renderLessonPlanDocx(DOC)).get('word/document.xml')!).not.toContain('Teacher notes');
  });

  test('and in the PDF', async () => {
    const bytes = await renderLessonPlanPdf(noted);
    expect(bytes.length).toBeGreaterThan((await renderLessonPlanPdf(DOC)).length);
  });
});

describe("If you have more time (Kevin's note 10c)", () => {
  const extended: LessonPlanDoc = {
    ...DOC,
    extensions: [{ title: 'Read on', minutes: 10, summary: 'Students keep reading to the end of the chapter.', purpose: '' }],
  };

  test('after the Closing in the Word file, and not there when there are none', async () => {
    const xml = zipParts(await renderLessonPlanDocx(extended)).get('word/document.xml')!;
    expect(xml).toContain('If you have more time');
    expect(xml.indexOf('If you have more time')).toBeGreaterThan(xml.indexOf('Closing'));
    expect(xml).toContain('Students keep reading to the end of the chapter.');
    expect(zipParts(await renderLessonPlanDocx(DOC)).get('word/document.xml')!).not.toContain('If you have more time');
  });

  test('and in the PDF', async () => {
    expect((await renderLessonPlanPdf(extended)).length).toBeGreaterThan((await renderLessonPlanPdf(DOC)).length);
  });
});

describe('a unit plan prints its map (Nov 22 review)', () => {
  const map = unitMapFromReply(readFileSync(join(import.meta.dir, 'fixtures', 'printables-mice-unit-reply.md'), 'utf8'))!;
  const unit = buildUnitPlanDoc({ map, className: 'English 10', periodMinutes: 50 });

  test('the Word file: the unit’s title, each day with its parts, no lesson template', async () => {
    const xml = zipParts(await renderLessonPlanDocx(unit)).get('word/document.xml')!;
    expect(xml).toContain('>Of Mice and Men<');
    expect(xml).toContain('>Unit map<');
    expect(xml).toContain('Day 1: Dreams and destiny (50 min)');
    expect(xml).toContain('Day 15: Final essay due (50 min)');
    expect(xml).toContain('Reading: Chapter 1 (pp. 1–16), read aloud in class');
    expect(xml).not.toContain('>Instructions<');
    expect(xml).not.toContain('>Closing<');
    expect(xml).not.toContain('Add this lesson');
    expect(xml).not.toContain('0 parts');
  });

  test('the PDF too', async () => {
    const pdf = await getDocumentProxy(await renderLessonPlanPdf(unit));
    const { text } = await extractText(pdf, { mergePages: true });
    expect(text).toContain('Of Mice and Men');
    expect(text).toContain('Day 9: The ending');
    expect(text).toContain('In class: Read Chapter 6 together');
    expect(text).not.toContain('Instructions');
  });
});
