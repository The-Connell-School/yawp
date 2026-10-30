/**
 * Student handouts as Word (Oct 24 handoff, task 4: Print it for class ›
 * Student handouts › Word), and the source of their Google Doc: the same
 * steps, written for students, as the handouts PDF, with lines to write on.
 */
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

export type HandoutPart = { id: string; title: string; content: string; lines: number };

/** A line of Markdown as runs: **bold** kept, other marks dropped. */
function runs(text: string): TextRun[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((piece) =>
      piece.startsWith('**') && piece.endsWith('**')
        ? new TextRun({ text: piece.slice(2, -2), bold: true })
        : new TextRun({ text: piece.replace(/[*_`]/g, '') })
    );
}

function contentParagraphs(content: string): Paragraph[] {
  return content
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .map((line) => {
      const heading = /^(#{1,6})\s+(.*)$/.exec(line);
      if (heading) return new Paragraph({ heading: HeadingLevel.HEADING_3, children: runs(heading[2]!) });
      const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
      if (bullet) return new Paragraph({ bullet: { level: 0 }, children: runs(bullet[1]!) });
      const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      if (numbered) return new Paragraph({ numbering: undefined, children: runs(line.trim()) });
      return new Paragraph({ children: runs(line), spacing: { after: 120 } });
    });
}

function writingLine(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: '' })],
    spacing: { before: 320 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9C2B8', space: 1 } },
  });
}

export function handoutDocument({
  title,
  className,
  parts,
}: {
  title: string;
  className: string | null;
  parts: HandoutPart[];
}): Document {
  const single = parts.length === 1;
  const heading = single ? parts[0]!.title : title;
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: heading })] }),
    ...(className ? [new Paragraph({ children: [new TextRun({ text: className, italics: true })] })] : []),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 200, after: 300 },
      children: [new TextRun({ text: 'Name: _______________________     Section: ____________     Date: ____________' })],
    }),
  ];
  parts.forEach((part, index) => {
    if (!single) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          pageBreakBefore: index > 0,
          children: [new TextRun({ text: `${index + 1}. ${part.title}` })],
        })
      );
    }
    children.push(...contentParagraphs(part.content));
    for (let line = 0; line < part.lines; line += 1) children.push(writingLine());
  });
  if (!parts.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'Pick the steps that go in this handout.', italics: true })] }));
  }
  return new Document({
    creator: 'Yawp!',
    title: heading,
    styles: { default: { document: { run: { font: 'Georgia', size: 23 } } } },
    sections: [{ children }],
  });
}

export async function renderHandoutDocx(input: {
  title: string;
  className: string | null;
  parts: HandoutPart[];
}): Promise<Buffer> {
  return Packer.toBuffer(handoutDocument(input));
}
