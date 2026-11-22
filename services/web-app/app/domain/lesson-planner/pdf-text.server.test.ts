/**
 * "mētis" printed as "m7F—2—2F†R6ÆPverness" (Nov 22 review): pdfkit's
 * built-in fonts cannot print a macron, and the hex they write for it throws
 * off the rest of the line.
 */
import { describe, expect, test } from 'bun:test';
import PDFDocument from 'pdfkit';
import { extractText, getDocumentProxy } from 'unpdf';
import { guardPdfText, isWinAnsi, winAnsiText } from './pdf-text.server';
import { renderHandoutPdf, renderPacketPdf, renderSlidesPdf, renderStepHandoutPdf } from './lesson-pdf.server';
import { renderLessonPlanPdf } from './lesson-plan-render.server';
import { renderKitPlanPdf } from './kit-plan-render.server';
import { buildLessonPacket } from './lesson-packet';
import type { LessonPlanDoc } from './lesson-plan-doc';
import type { KitPlan } from './kit-plan';

const WORDS = 'Kleos and mētis — cleverness. Achebe’s Okonkwo; the Æneid; a naïve “hero” – or not.';

async function textOf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/\s+/g, ' ');
}

async function written(write: (doc: InstanceType<typeof PDFDocument>) => void, guard?: Parameters<typeof guardPdfText>[1]): Promise<Uint8Array> {
  const doc = guardPdfText(new PDFDocument({ size: 'LETTER' }), guard);
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });
  write(doc);
  doc.end();
  return new Uint8Array(await done);
}

describe('winAnsiText: the last resort, never garbage', () => {
  test('a macron and other marks lose the mark; what Windows-1252 has stays', () => {
    expect(winAnsiText('mētis')).toBe('metis');
    expect(winAnsiText('Achebe’s Æneid naïve “hero” — or – not')).toBe('Achebe’s Æneid naïve “hero” — or – not');
    expect(winAnsiText('Łódź → Kraków')).toBe('Lódz -> Kraków');
    expect(winAnsiText('ā')).toBe('a');
    expect(winAnsiText('κλέος')).toBe('?????');
    expect(winAnsiText('Great job 🎉')).toBe('Great job ');
  });

  test('isWinAnsi', () => {
    expect(isWinAnsi('Achebe’s Æneid naïve “hero” — €')).toBe(true);
    expect(isWinAnsi('mētis')).toBe(false);
  });
});

describe('guardPdfText', () => {
  test('a built-in font prints mētis and every word after it', async () => {
    const text = await textOf(await written((doc) => doc.font('Helvetica').text(WORDS, { width: 400 })));
    expect(text).toContain(WORDS);
  });

  test('bold, italic, continued runs and Times too', async () => {
    const text = await textOf(
      await written((doc) => {
        doc.font('Helvetica-Bold').text('Kleos and ', { continued: true, width: 400 });
        doc.font('Helvetica-Oblique').text('mētis', { continued: true });
        doc.font('Helvetica').text(' — cleverness.');
        doc.font('Times-Roman').text('Poseidon’s son, Polyphēmos.');
      })
    );
    expect(text).toContain('Kleos and mētis — cleverness.');
    expect(text).toContain('Poseidon’s son, Polyphēmos.');
  });

  test('without the font files, spelled in Windows-1252 rather than garbled', async () => {
    const text = await textOf(await written((doc) => doc.font('Helvetica').text(WORDS, { width: 400 }), { files: () => null }));
    expect(text).toContain('Kleos and metis — cleverness. Achebe’s Okonkwo; the Æneid; a naïve “hero” – or not.');
  });

  test('text a built-in font can print stays in it', async () => {
    const raw = Buffer.from(await written((doc) => doc.font('Helvetica').text('Achebe’s Æneid, naïve “hero” — no embedding.'))).toString('latin1');
    expect(raw).not.toContain('Arimo');
  });
});

describe('every printable prints it', () => {
  const packet = buildLessonPacket({
    title: 'Hero or show-off? Odysseus’s mētis',
    className: 'English 9',
    sections: [
      { id: 's1', content: `## Context\n\n${WORDS}\n\n> “Nobody — that’s my name.”`, keptAudience: 'student', keptTitle: 'Kleos and mētis', origin: 'reply' as const },
    ],
  });

  test('the slides PDF and its speaker notes', async () => {
    const deck = {
      title: 'Hero or Show-Off?',
      slides: [
        { layout: 'title', title: 'Hero or Show-Off?', speakerNotes: 'Open.' },
        { layout: 'notes', title: 'Kleos and mētis', facts: ['mētis — cleverness'], speakerNotes: `Define ${WORDS}` },
      ],
    } as never;
    const text = await textOf(await renderSlidesPdf({ lessonTitle: 'Odyssey 9', deck }));
    expect(text).toContain(WORDS);
    expect(text).not.toContain('m7F');
  });

  test('the packet, the handout and the step handout', async () => {
    for (const bytes of [
      await renderPacketPdf(packet),
      await renderHandoutPdf({ packet }),
      await renderHandoutPdf({ packet, kit: { color: '#3F5A73' } }),
      await renderStepHandoutPdf({ title: packet.title, className: null, parts: [{ id: 'a', title: 'Kleos and mētis', content: WORDS, lines: 2 }] }),
    ]) {
      const text = await textOf(bytes);
      expect(text).toContain(WORDS);
      expect(text).toContain('mētis');
    }
  });

  test('the lesson plan, plain and in the kit', async () => {
    const doc: LessonPlanDoc = {
      title: 'Odysseus’s mētis',
      className: null,
      periodMinutes: 50,
      overview: WORDS,
      goals: ['Students will define mētis.'],
      teacherWill: [],
      materials: [],
      instructions: [{ title: 'Context: kleos and mētis', minutes: 7, summary: WORDS, purpose: '' }],
      closing: 'Close.',
      closingStep: null,
      closingInStack: false,
      extensions: [],
      assessment: null,
      standards: [],
    };
    expect(await textOf(await renderLessonPlanPdf(doc))).toContain(WORDS);
    const kit: KitPlan = {
      accent: '3F5A73',
      colors: ['#3F5A73'],
      kicker: 'Yawp! LESSON PLAN',
      title: 'Odysseus’s mētis',
      subtitle: null,
      footer: 'plan',
      meta: [['Class', 'English 9']],
      body: [{ type: 'callout', title: 'Overview', paras: [WORDS] }],
    };
    expect(await textOf(await renderKitPlanPdf(kit))).toContain(WORDS);
  });
});
