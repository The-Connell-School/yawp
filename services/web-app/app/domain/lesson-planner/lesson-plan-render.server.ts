/**
 * The concise lesson plan as files (Brian's run 2, D1, D2; items 28-31).
 *
 * Word first: teachers add their school's standards and requirements, and a
 * .docx opens in Word and in Google Docs (File → Open → Upload) with its
 * headings and numbered steps intact. The PDF is the same plan for printing.
 * Neither carries a logo (Brian, item 31).
 */
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import PDFDocument from 'pdfkit';
import type { LessonPlanDoc } from './lesson-plan-doc';
import { noteSections } from './teacher-notes';

function subtitle(doc: LessonPlanDoc): string {
  return [doc.className, doc.periodMinutes ? `${doc.periodMinutes} minutes` : null]
    .filter(Boolean)
    .join(' · ');
}

function stepHeading(step: LessonPlanDoc['instructions'][number]): string {
  return step.minutes !== null ? `${step.title} (${step.minutes} min)` : step.title;
}

const NUMBERING = 'lesson-plan-steps';

const BLANK_HINTS = {
  standards: 'Add the standards this lesson meets.',
  moreStandards: 'Add any others this lesson meets.',
  differentiation: 'Add supports, extensions and accommodations for your students.',
  assessment: 'Add how you will check what students learned.',
};

/** A step as a real (numbered) Heading 3, its summary, and its why. */
function stepParagraphs(step: LessonPlanDoc['instructions'][number], numbered: boolean): Paragraph[] {
  const paragraphs = [
    new Paragraph({
      text: stepHeading(step),
      heading: HeadingLevel.HEADING_3,
      ...(numbered ? { numbering: { reference: NUMBERING, level: 0 } } : {}),
      spacing: { before: 120 },
    }),
  ];
  if (step.summary) paragraphs.push(new Paragraph({ text: step.summary, indent: { left: 720 } }));
  if (step.purpose) {
    paragraphs.push(
      new Paragraph({
        indent: { left: 720 },
        children: [new TextRun({ text: `Why: ${step.purpose}`, italics: true })],
      })
    );
  }
  if (step.teacherNotes) {
    paragraphs.push(
      new Paragraph({ indent: { left: 720 }, spacing: { before: 80 }, children: [new TextRun({ text: 'Teacher notes', bold: true })] }),
      ...noteSections(step.teacherNotes).map(
        (note) =>
          new Paragraph({
            indent: { left: 720 },
            children: [
              ...(note.heading ? [new TextRun({ text: `${note.heading}: `, bold: true })] : []),
              new TextRun({ text: note.body.replace(/\n/g, ' ') }),
            ],
          })
      )
    );
  }
  return paragraphs;
}

export async function renderLessonPlanDocx(doc: LessonPlanDoc): Promise<Uint8Array> {
  const heading = (text: string) =>
    new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } });
  const body = (text: string) => new Paragraph({ children: [new TextRun(text)], spacing: { after: 80 } });
  const bullet = (text: string) => new Paragraph({ text, bullet: { level: 0 } });

  const children: Paragraph[] = [
    new Paragraph({ text: doc.title, heading: HeadingLevel.HEADING_1 }),
  ];
  const sub = subtitle(doc);
  if (sub) children.push(new Paragraph({ children: [new TextRun({ text: sub, italics: true })] }));

  // Every part is a real heading or paragraph a teacher can edit, restyle or
  // add to; blank sections carry one italic line saying what goes there
  // (Brian's run 3, item 12).
  const hint = (text: string) =>
    new Paragraph({ children: [new TextRun({ text, italics: true, color: '6B7280' })], spacing: { after: 80 } });
  children.push(heading('Overview'), body(doc.overview));
  // The ones the teacher named, then room for more; never inferred.
  children.push(
    heading('Standards'),
    ...doc.standards.map(bullet),
    hint(doc.standards.length ? BLANK_HINTS.moreStandards : BLANK_HINTS.standards)
  );
  children.push(heading('Learning objectives'), ...doc.goals.map(bullet));
  if (doc.teacherWill.length) children.push(heading('Teacher will'), ...doc.teacherWill.map(bullet));
  if (doc.materials.length) children.push(heading('Materials'), ...doc.materials.map(bullet));

  children.push(heading('Instructions'));
  for (const step of doc.instructions) {
    children.push(...stepParagraphs(step, true));
  }

  children.push(heading('Closing'));
  if (doc.closingStep) children.push(...stepParagraphs(doc.closingStep, false));
  else children.push(body(doc.closing));
  children.push(heading('Differentiation / accommodations'), hint(BLANK_HINTS.differentiation));
  children.push(heading('Assessment'), doc.assessment ? body(doc.assessment) : hint(BLANK_HINTS.assessment));

  const document = new Document({
    creator: 'Yawp! Lesson Planner',
    title: doc.title,
    numbering: {
      config: [
        {
          reference: NUMBERING,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
    },
    sections: [{ children }],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

const INK = '#1a1a1a';
const MUTED = '#6b7280';
const RULE = '#c05a3e';

export async function renderLessonPlanPdf(doc: LessonPlanDoc): Promise<Uint8Array> {
  const pdf = new PDFDocument({
    size: 'LETTER',
    margin: 54,
    info: { Title: doc.title, Creator: 'Yawp! Lesson Planner' },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });

  const width = pdf.page.width - 108;
  pdf.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(doc.title, { width });
  const sub = subtitle(doc);
  if (sub) pdf.moveDown(0.2).font('Helvetica').fontSize(10.5).fillColor(MUTED).text(sub, { width });
  pdf
    .moveDown(0.4)
    .strokeColor(RULE)
    .lineWidth(1.5)
    .moveTo(54, pdf.y)
    .lineTo(54 + width, pdf.y)
    .stroke()
    .fillColor(INK);

  const section = (title: string) => {
    pdf.moveDown(0.8).font('Helvetica-Bold').fontSize(12.5).fillColor(INK).text(title, { width });
    pdf.moveDown(0.25).font('Helvetica').fontSize(10.5);
  };
  const list = (items: string[]) => {
    for (const item of items) pdf.text(`•  ${item}`, { width, indent: 8 });
  };

  const hint = (text: string) => {
    pdf.font('Helvetica-Oblique').fillColor(MUTED).text(text, { width });
    pdf.font('Helvetica').fillColor(INK);
  };
  section('Overview');
  pdf.text(doc.overview, { width });
  section('Standards');
  list(doc.standards);
  hint(doc.standards.length ? BLANK_HINTS.moreStandards : BLANK_HINTS.standards);
  section('Learning objectives');
  list(doc.goals);
  if (doc.teacherWill.length) {
    section('Teacher will');
    list(doc.teacherWill);
  }
  if (doc.materials.length) {
    section('Materials');
    list(doc.materials);
  }
  section('Instructions');
  const pdfStep = (step: LessonPlanDoc['instructions'][number], label: string) => {
    pdf.moveDown(0.3).font('Helvetica-Bold').text(label, { width });
    pdf.font('Helvetica');
    // Placed, not indented: pdfkit indents only a paragraph's first line.
    if (step.summary) pdf.text(step.summary, 72, pdf.y, { width: width - 18 });
    if (step.purpose) {
      pdf
        .font('Helvetica-Oblique')
        .fillColor(MUTED)
        .text(`Why: ${step.purpose}`, 72, pdf.y, { width: width - 18 });
      pdf.font('Helvetica').fillColor(INK);
    }
    if (step.teacherNotes) {
      pdf.moveDown(0.2).font('Helvetica-Bold').text('Teacher notes', 72, pdf.y, { width: width - 18 });
      for (const note of noteSections(step.teacherNotes)) {
        if (note.heading) pdf.font('Helvetica-Bold').text(`${note.heading}: `, 72, pdf.y, { width: width - 18, continued: true });
        pdf.font('Helvetica').text(note.body.replace(/\n/g, ' '), note.heading ? undefined : 72, note.heading ? undefined : pdf.y, { width: width - 18 });
      }
    }
    pdf.x = 54;
  };
  doc.instructions.forEach((step, index) => pdfStep(step, `${index + 1}. ${stepHeading(step)}`));
  section('Closing');
  if (doc.closingStep) pdfStep(doc.closingStep, stepHeading(doc.closingStep));
  else pdf.text(doc.closing, { width });
  section('Differentiation / accommodations');
  hint(BLANK_HINTS.differentiation);
  section('Assessment');
  if (doc.assessment) pdf.text(doc.assessment, { width });
  else hint(BLANK_HINTS.assessment);

  pdf.end();
  return new Uint8Array(await done);
}

/** "Lesson plan - Day 1.docx", kept to ASCII-safe characters. */
export function lessonPlanFilename(title: string, extension: 'docx' | 'pdf'): string {
  const base = (title || 'Lesson')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${base || 'Lesson'} - Lesson plan.${extension}`;
}
