import { describe, expect, test } from 'bun:test';
import { inflateRawSync } from 'node:zlib';
import { renderKitPlanDocx, renderKitPlanPdf } from './kit-plan-render.server';
import type { KitPlan } from './kit-plan';

const plan: KitPlan = {
  accent: '9C4A22',
  colors: ['#9C4A22', '#3F5A73', '#7D6118'],
  kicker: 'YAWP! LESSON PLAN · THE CRITICAL ESSAY',
  title: 'Conclusion Paragraph',
  subtitle: 'Land the plane',
  footer: 'Conclusion Paragraph lesson plan',
  meta: [
    ['Step', '5 of the writing process: conclusion'],
    ['Slide deck', 'Conclusion Paragraph'],
    ['Platform', 'yawp.school'],
  ],
  body: [
    { type: 'callout', title: 'Overview', paras: ['Students learn the **five** moves.'] },
    { type: 'h2', text: 'Goals' },
    { type: 'twoCol', cols: [['Students will…', ['restate a thesis']], ['The teacher will…', ['model it']]] },
    { type: 'standards' },
    { type: 'h2', text: 'Materials' },
    { type: 'bullets', items: ['Slide deck: Conclusion Paragraph', 'Student access to yawp.school'] },
    { type: 'h2', text: 'Lesson steps' },
    { type: 'phase', text: 'The lesson' },
    {
      type: 'step',
      num: '1',
      title: 'Teach the five moves',
      minutes: 15,
      slides: 'The five moves · Quiz show',
      paras: ['Name the moves: ~~2|restate~~, widen.'],
      items: ['Restate', { t: 'Widen', sub: ['Why it matters'] }],
      after: [{ type: 'quote', text: 'Three friends see a movie.' }],
    },
  ],
};

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

async function documentXml(): Promise<{ doc: string; styles: string; footer: string; numbering: string }> {
  const parts = zipParts(await renderKitPlanDocx(plan));
  const footerName = [...parts.keys()].find((name) => /word\/footer\d*\.xml/.test(name))!;
  return {
    doc: parts.get('word/document.xml')!,
    styles: parts.get('word/styles.xml')!,
    footer: parts.get(footerName)!,
    numbering: parts.get('word/numbering.xml')!,
  };
}

describe('renderKitPlanDocx: the lesson plan spec v1 Word file', () => {
  test('US Letter, 0.75 inch margins, Georgia and Arial only, no highlighting', async () => {
    const { doc, styles } = await documentXml();
    expect(doc).toContain('w:w="12240"');
    expect(doc).toContain('w:h="15840"');
    expect(doc).toMatch(/w:top="1080"/);
    const fonts = new Set([...`${doc}${styles}`.matchAll(/w:ascii="([^"]+)"/g)].map((match) => match[1]));
    expect([...fonts].sort()).toEqual(['Arial', 'Georgia']);
    expect(doc).not.toContain('w:highlight');
  });

  test('built-in headings, real numbering, kept with the next paragraph', async () => {
    const { doc, numbering } = await documentXml();
    expect(doc).toContain('w:pStyle w:val="Heading1"');
    expect(doc).toContain('w:pStyle w:val="Heading2"');
    expect(doc).toContain('w:pStyle w:val="Heading3"');
    expect(doc).toContain('<w:numPr>');
    expect(doc).toContain('<w:keepNext/>');
    expect(numbering).toContain('w:val="lowerLetter"');
    expect(numbering).toContain('w:val="lowerRoman"');
  });

  test('fixed twip table widths and clear shading in the spec’s fills', async () => {
    const { doc } = await documentXml();
    expect(doc).toContain('w:type="dxa"');
    expect(doc).not.toContain('w:type="pct"');
    expect(doc).toMatch(/w:val="clear"[^>]*w:fill="F7F4F0"|w:fill="F7F4F0"[^>]*w:val="clear"/);
    expect(doc).toContain('E9E3D9');
  });

  test('the spec’s text: kicker, info lines, standards placeholder, slides line, colored runs', async () => {
    const { doc } = await documentXml();
    for (const text of [
      'YAWP! LESSON PLAN · THE CRITICAL ESSAY',
      'Land the plane',
      '5 of the writing process: conclusion',
      '[ Add the standards this lesson covers ]',
      'SLIDES',
      'The five moves · Quiz show',
      'Teach the five moves',
      'Three friends see a movie.',
    ]) {
      expect(doc).toContain(text);
    }
    expect(doc).toContain('w:color w:val="3F5A73"');
    expect(doc).toContain('w:color w:val="9C4A22"');
  });

  test('the footer carries the program, the lesson and a real page field', async () => {
    const { footer } = await documentXml();
    expect(footer).toContain('Yawp! Writing Program | Conclusion Paragraph lesson plan | Page ');
    expect(footer).toContain('PAGE');
  });
});

describe('renderKitPlanDocx: standards the teacher named', () => {
  test('listed in the box, with room for more', async () => {
    const named: KitPlan = { ...plan, body: plan.body.map((block) => (block.type === 'standards' ? { type: 'standards', items: ['RL.9-10.1'] } : block)) };
    const doc = zipParts(await renderKitPlanDocx(named)).get('word/document.xml')!;
    expect(doc).toContain('RL.9-10.1');
    expect(doc).toContain('[ Add any others this lesson covers ]');
    expect(doc).not.toContain('[ Add the standards this lesson covers ]');
  });
});

describe('renderKitPlanPdf', () => {
  test('a Letter PDF with Gelasio and Arimo embedded', async () => {
    const bytes = await renderKitPlanPdf(plan);
    const text = Buffer.from(bytes).toString('latin1');
    expect(text.startsWith('%PDF')).toBe(true);
    expect(text).toContain('612 792');
    expect(text).toMatch(/Gelasio/);
    expect(text).toMatch(/Arimo/);
  });
});
