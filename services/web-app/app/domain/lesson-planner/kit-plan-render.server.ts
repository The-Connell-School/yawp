/**
 * The lesson plan spec v1 (Yawp! Lesson Deck Kit) as files: a Word file that
 * opens cleanly in Word and Google Docs, and the same plan as a PDF.
 *
 * The Word file follows "Building the file": US Letter with 0.75-inch
 * margins; built-in heading styles; real list numbering; the page number as a
 * field; every heading and step title kept with the text after it; tables in
 * fixed twip widths with clear shading; colored text, never highlighting.
 * Georgia and Arial only.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import PDFDocument from 'pdfkit';
import { KIT_PLAN_MORE_STANDARDS, KIT_PLAN_PROGRAM, KIT_PLAN_STANDARDS_PLACEHOLDER, kitRuns, type KitBlock, type KitListItem, type KitPlan } from './kit-plan';
import { registerKitFonts } from './kit-fonts.server';

/** Spec "Type and color". */
export const KIT_PLAN_COLORS = {
  ink: '1B1B1B',
  body: '2E2B27',
  stone: '6F6A63',
  rule: 'D8D0C1',
  calloutFill: 'F7F4F0',
  headerFill: 'E9E3D9',
} as const;
const C = KIT_PLAN_COLORS;
const SERIF = 'Georgia';
const SANS = 'Arial';
/** Half-points: title 26, subtitle 13, section 15, step 12, body 10, info 9, footer 7.5. */
const SIZE = { title: 52, subtitle: 26, section: 30, step: 24, body: 20, info: 18, footer: 15, label: 15 } as const;

const PAGE = { width: 12240, height: 15840, margin: 1080 };
/** The text block, in twips: 8.5in less two 0.75in margins. */
const TEXT_WIDTH = PAGE.width - 2 * PAGE.margin;

const STEPS = 'kit-plan-steps';
const ITEMS = 'kit-plan-items';
const BULLETS = 'kit-plan-bullets';

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const HAIRLINE = { style: BorderStyle.SINGLE, size: 4, color: C.rule } as const;
const CLEAR = (fill: string) => ({ type: ShadingType.CLEAR, color: 'auto', fill });

type RunStyle = { font?: string; size?: number; color?: string; bold?: boolean; italics?: boolean };

function runs(text: string, plan: KitPlan, style: RunStyle = {}): TextRun[] {
  return kitRuns(text, plan.colors).map(
    (run) =>
      new TextRun({
        text: run.text,
        font: style.font ?? SANS,
        size: style.size ?? SIZE.body,
        color: run.color ?? style.color ?? C.body,
        bold: run.bold ?? style.bold,
        italics: run.italic ?? style.italics,
      })
  );
}

function bodyParagraph(text: string, plan: KitPlan, extra: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}) {
  return new Paragraph({ children: runs(text, plan), spacing: { after: 100, line: 276 }, keepLines: true, ...extra });
}

function callout(block: Extract<KitBlock, { type: 'callout' }>, plan: KitPlan): Table {
  return new Table({
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: [TEXT_WIDTH],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: TEXT_WIDTH, type: WidthType.DXA },
            shading: CLEAR(C.calloutFill),
            borders: { top: NONE, bottom: NONE, right: NONE, left: { style: BorderStyle.SINGLE, size: 24, color: plan.accent } },
            margins: { top: 140, bottom: 100, left: 220, right: 220 },
            children: [
              new Paragraph({
                keepNext: true,
                spacing: { after: 60 },
                children: [new TextRun({ text: block.title, font: SERIF, size: 23, color: plan.accent })],
              }),
              ...block.paras.map((text) => bodyParagraph(text, plan, { spacing: { after: 60, line: 276 } })),
            ],
          }),
        ],
      }),
    ],
  });
}

function bullet(text: string, plan: KitPlan, instance?: number): Paragraph {
  return new Paragraph({
    children: runs(text, plan),
    numbering: { reference: BULLETS, level: 0, ...(instance ? { instance } : {}) },
    spacing: { after: 40, line: 264 },
  });
}

function twoCol(block: Extract<KitBlock, { type: 'twoCol' }>, plan: KitPlan): Table {
  const width = Math.floor(TEXT_WIDTH / block.cols.length);
  const widths = block.cols.map((_, index) => (index === block.cols.length - 1 ? TEXT_WIDTH - width * index : width));
  const borders = { top: HAIRLINE, bottom: HAIRLINE, left: HAIRLINE, right: HAIRLINE };
  return new Table({
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: block.cols.map(
          ([heading], index) =>
            new TableCell({
              width: { size: widths[index]!, type: WidthType.DXA },
              shading: CLEAR(C.headerFill),
              borders,
              margins: { top: 80, bottom: 80, left: 140, right: 140 },
              children: [new Paragraph({ children: [new TextRun({ text: heading, font: SERIF, size: SIZE.body + 2, color: C.ink })] })],
            })
        ),
      }),
      new TableRow({
        children: block.cols.map(
          ([, items], index) =>
            new TableCell({
              width: { size: widths[index]!, type: WidthType.DXA },
              shading: CLEAR('FFFFFF'),
              borders,
              margins: { top: 80, bottom: 60, left: 140, right: 140 },
              children: items.length ? items.map((item) => bullet(item, plan, 100 + index)) : [new Paragraph({})],
            })
        ),
      }),
    ],
  });
}

function standards(items: string[] = [], plan: KitPlan): Table {
  return new Table({
    width: { size: TEXT_WIDTH, type: WidthType.DXA },
    columnWidths: [TEXT_WIDTH],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: TEXT_WIDTH, type: WidthType.DXA },
            shading: CLEAR('FFFFFF'),
            borders: { top: HAIRLINE, bottom: HAIRLINE, left: HAIRLINE, right: HAIRLINE },
            margins: { top: 160, bottom: 160, left: 200, right: 200 },
            children: [
              new Paragraph({
                keepNext: true,
                spacing: { after: 60 },
                children: [new TextRun({ text: 'Standards covered', font: SERIF, size: SIZE.body + 2, color: C.ink })],
              }),
              ...items.map((item) => bullet(item, plan, 200)),
              new Paragraph({
                children: [
                  new TextRun({
                    text: items.length ? KIT_PLAN_MORE_STANDARDS : KIT_PLAN_STANDARDS_PLACEHOLDER,
                    font: SANS,
                    size: SIZE.body,
                    color: C.stone,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function spacer(after = 120): Paragraph {
  return new Paragraph({ spacing: { after, before: 0 }, children: [] });
}

function listItems(items: KitListItem[], plan: KitPlan, instance: number): Paragraph[] {
  return items.flatMap((item) => {
    const top = typeof item === 'string' ? item : item.t;
    const sub = typeof item === 'string' ? [] : item.sub;
    return [
      new Paragraph({ children: runs(top, plan), numbering: { reference: ITEMS, level: 0, instance }, spacing: { after: 40 }, keepLines: true }),
      ...sub.map(
        (text) =>
          new Paragraph({ children: runs(text, plan), numbering: { reference: ITEMS, level: 1, instance }, spacing: { after: 40 }, keepLines: true })
      ),
    ];
  });
}

function quote(text: string, plan: KitPlan): Paragraph {
  return new Paragraph({
    children: runs(text, plan, { font: SERIF, italics: true, color: C.body, size: SIZE.body + 1 }),
    indent: { left: 400 },
    border: { left: { style: BorderStyle.SINGLE, size: 6, color: C.rule, space: 10 } },
    spacing: { before: 60, after: 120, line: 276 },
    keepLines: true,
  });
}

function blocks(list: KitBlock[], plan: KitPlan, counter: { step: number }): Array<Paragraph | Table> {
  return list.flatMap((block): Array<Paragraph | Table> => {
    switch (block.type) {
      case 'callout':
        return [callout(block, plan), spacer()];
      case 'h2':
        return [new Paragraph({ text: block.text, heading: HeadingLevel.HEADING_2 })];
      case 'twoCol':
        return [twoCol(block, plan), spacer()];
      case 'standards':
        return [standards(block.items, plan), spacer()];
      case 'bullets':
        return block.items.map((item) => bullet(item, plan));
      case 'phase':
        return [
          new Paragraph({
            keepNext: true,
            spacing: { before: 240, after: 120 },
            border: { bottom: { ...HAIRLINE, space: 3 } },
            children: [new TextRun({ text: block.text.toUpperCase(), font: SANS, bold: true, size: SIZE.label + 1, color: plan.accent, characterSpacing: 30 })],
          }),
        ];
      case 'quote':
        return [quote(block.text, plan)];
      case 'step': {
        counter.step += 1;
        const out: Array<Paragraph | Table> = [
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            numbering: { reference: STEPS, level: 0 },
            children: [
              new TextRun({ text: block.title }),
              ...(block.minutes ? [new TextRun({ text: `  ·  ${block.minutes} min`, font: SANS, bold: false, size: SIZE.info, color: C.stone })] : []),
            ],
          }),
        ];
        if (block.slides) {
          out.push(
            new Paragraph({
              keepNext: true,
              spacing: { after: 80 },
              indent: { left: 440 },
              children: [
                new TextRun({ text: 'SLIDES', font: SANS, bold: true, size: SIZE.label, color: C.stone, characterSpacing: 24 }),
                new TextRun({ text: `   ${block.slides}`, font: SANS, size: SIZE.info, color: C.stone }),
              ],
            })
          );
        }
        out.push(...block.paras.map((text) => bodyParagraph(text, plan, { indent: { left: 440 } })));
        if (block.items?.length) out.push(...listItems(block.items, plan, counter.step));
        if (block.after?.length) out.push(...blocks(block.after, plan, counter));
        return out;
      }
    }
  });
}

export async function renderKitPlanDocx(plan: KitPlan): Promise<Uint8Array> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: plan.kicker, font: SANS, bold: true, size: SIZE.label + 1, color: plan.accent, characterSpacing: 30 })],
    }),
    new Paragraph({ text: plan.title, heading: HeadingLevel.HEADING_1 }),
  ];
  if (plan.subtitle) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: plan.subtitle, font: SERIF, italics: true, size: SIZE.subtitle, color: plan.accent })],
      })
    );
  }
  for (const [label, value] of plan.meta) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `${label}  `, font: SANS, bold: true, size: SIZE.info, color: C.stone }),
          ...runs(value, plan, { size: SIZE.info }),
        ],
      })
    );
  }
  children.push(spacer(200), ...blocks(plan.body, plan, { step: 0 }));

  const heading = (size: number, bold: boolean, before: number, after: number) => ({
    run: { font: SERIF, size, color: C.ink, bold },
    paragraph: { spacing: { before, after }, keepNext: true, keepLines: true },
  });
  const document = new Document({
    creator: 'Yawp! Lesson Planner',
    title: `${plan.title} lesson plan`,
    styles: {
      default: {
        document: { run: { font: SANS, size: SIZE.body, color: C.body } },
        heading1: heading(SIZE.title, false, 0, 80),
        heading2: heading(SIZE.section, false, 280, 120),
        heading3: heading(SIZE.step, true, 200, 80),
      },
    },
    numbering: {
      config: [
        {
          reference: STEPS,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1',
              alignment: AlignmentType.START,
              style: {
                run: { font: SERIF, italics: true, bold: false, color: plan.accent, size: SIZE.step + 4 },
                paragraph: { indent: { left: 440, hanging: 440 } },
              },
            },
          ],
        },
        {
          reference: ITEMS,
          levels: [
            {
              level: 0,
              format: LevelFormat.LOWER_LETTER,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { run: { font: SANS, color: plan.accent }, paragraph: { indent: { left: 800, hanging: 360 } } },
            },
            {
              level: 1,
              format: LevelFormat.LOWER_ROMAN,
              text: '%2.',
              alignment: AlignmentType.START,
              style: { run: { font: SANS, color: C.stone }, paragraph: { indent: { left: 1240, hanging: 360 } } },
            },
          ],
        },
        {
          reference: BULLETS,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.START,
              style: { run: { font: SANS, color: plan.accent }, paragraph: { indent: { left: 360, hanging: 240 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.width, height: PAGE.height },
            margin: { top: PAGE.margin, right: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, footer: 540 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    font: SANS,
                    size: SIZE.footer,
                    color: C.stone,
                    children: [`${KIT_PLAN_PROGRAM} | ${plan.footer} | Page `, PageNumber.CURRENT],
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

/** The same plan, for printing: Gelasio and Arimo standing in for Georgia and Arial. */
export async function renderKitPlanPdf(plan: KitPlan): Promise<Uint8Array> {
  const margin = 54;
  const pdf = new PDFDocument({
    size: 'LETTER',
    margins: { top: margin, bottom: margin + 18, left: margin, right: margin },
    bufferPages: true,
    info: { Title: `${plan.title} lesson plan`, Creator: 'Yawp! Lesson Planner' },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  const F = registerKitFonts(pdf);
  const hex = (value: string) => `#${value}`;
  const accent = hex(plan.accent);
  const width = pdf.page.width - 2 * margin;
  const bottom = () => pdf.page.height - margin - 18;
  const ensure = (height: number) => {
    if (pdf.y + height > bottom()) pdf.addPage();
  };

  /** Inline-marked text at x, wrapped to w. */
  const text = (value: string, x: number, w: number, { size = 10, font = F.sans, italicFont = F.sansItalic, boldFont = F.sansBold, color = hex(C.body) } = {}) => {
    const pieces = kitRuns(value, plan.colors);
    pdf.x = x;
    pieces.forEach((run, index) => {
      pdf
        .font(run.bold ? boldFont : run.italic ? italicFont : font)
        .fontSize(size)
        .fillColor(run.color ? hex(run.color) : color)
        .text(
          run.text,
          ...((index === 0
            ? [x, pdf.y, { width: w, continued: index < pieces.length - 1, lineGap: 2 }]
            : [{ continued: index < pieces.length - 1 }]) as [number, number, PDFKit.Mixins.TextOptions])
        );
    });
    pdf.x = margin;
  };
  const caps = (value: string, x: number, size: number, color: string) =>
    pdf.font(F.sansBold).fontSize(size).fillColor(color).text(value.toUpperCase(), x, pdf.y, { characterSpacing: 1.2, width });

  caps(plan.kicker, margin, 7.5, accent);
  pdf.moveDown(0.5).font(F.serif).fontSize(26).fillColor(hex(C.ink)).text(plan.title, margin, pdf.y, { width });
  if (plan.subtitle) pdf.font(F.serifItalic).fontSize(13).fillColor(accent).text(plan.subtitle, { width });
  pdf.moveDown(0.6);
  for (const [label, value] of plan.meta) {
    pdf.font(F.sansBold).fontSize(9).fillColor(hex(C.stone)).text(`${label}  `, margin, pdf.y, { continued: true });
    pdf.font(F.sans).fillColor(hex(C.body)).text(value);
  }
  pdf.moveDown(0.8);

  const shadedBox = (draw: (x: number, w: number) => void, { fill, bar, border }: { fill?: string; bar?: string; border?: string }) => {
    const top = pdf.y;
    const pad = 10;
    // Measure by drawing once off-page would cost a second pass; boxes are short, so draw text, then the box behind it.
    const startPage = pdf.page;
    pdf.y = top + pad;
    draw(margin + pad + (bar ? 4 : 0), width - 2 * pad - (bar ? 4 : 0));
    const end = pdf.y + pad - 4;
    if (pdf.page === startPage) {
      pdf.save();
      if (fill) pdf.rect(margin, top, width, end - top).fillOpacity(1).fill(hex(fill));
      if (border) pdf.rect(margin, top, width, end - top).lineWidth(0.75).stroke(hex(border));
      if (bar) pdf.rect(margin, top, 3, end - top).fill(bar);
      pdf.restore();
      // Text again over the fill: pdfkit paints in order.
      pdf.y = top + pad;
      draw(margin + pad + (bar ? 4 : 0), width - 2 * pad - (bar ? 4 : 0));
    }
    pdf.y = end + 10;
    pdf.x = margin;
  };

  const list = (items: string[], x: number, w: number) => {
    for (const item of items) {
      const y = pdf.y;
      pdf.font(F.sans).fontSize(10).fillColor(accent).text('•', x, y);
      pdf.y = y;
      text(item, x + 12, w - 12);
      pdf.moveDown(0.15);
    }
  };

  const render = (list_: KitBlock[]) => {
    for (const block of list_) {
      switch (block.type) {
        case 'callout':
          ensure(60);
          shadedBox(
            (x, w) => {
              pdf.font(F.serif).fontSize(11.5).fillColor(accent).text(block.title, x, pdf.y, { width: w });
              pdf.moveDown(0.2);
              for (const para of block.paras) text(para, x, w);
            },
            { fill: C.calloutFill, bar: accent }
          );
          break;
        case 'h2':
          ensure(50);
          pdf.moveDown(0.4).font(F.serif).fontSize(15).fillColor(hex(C.ink)).text(block.text, margin, pdf.y, { width });
          pdf.moveDown(0.3);
          break;
        case 'twoCol': {
          ensure(70);
          const colWidth = width / block.cols.length;
          const top = pdf.y;
          pdf.save().rect(margin, top, width, 20).fill(hex(C.headerFill)).restore();
          block.cols.forEach(([heading], index) =>
            pdf.font(F.serif).fontSize(10.5).fillColor(hex(C.ink)).text(heading, margin + index * colWidth + 8, top + 5, { width: colWidth - 16 })
          );
          let lowest = top + 20;
          block.cols.forEach(([, items], index) => {
            pdf.y = top + 26;
            list(items, margin + index * colWidth + 8, colWidth - 16);
            lowest = Math.max(lowest, pdf.y);
          });
          pdf.save().lineWidth(0.75).strokeColor(hex(C.rule)).rect(margin, top, width, lowest - top + 4).stroke();
          block.cols.slice(1).forEach((_, index) => pdf.moveTo(margin + (index + 1) * colWidth, top).lineTo(margin + (index + 1) * colWidth, lowest + 4).stroke());
          pdf.restore();
          pdf.y = lowest + 14;
          pdf.x = margin;
          break;
        }
        case 'standards':
          ensure(50);
          shadedBox(
            (x, w) => {
              pdf.font(F.serif).fontSize(10.5).fillColor(hex(C.ink)).text('Standards covered', x, pdf.y, { width: w });
              pdf.moveDown(0.3);
              if (block.items?.length) list(block.items, x, w);
              pdf
                .font(F.sans)
                .fontSize(10)
                .fillColor(hex(C.stone))
                .text(block.items?.length ? KIT_PLAN_MORE_STANDARDS : KIT_PLAN_STANDARDS_PLACEHOLDER, x, pdf.y, { width: w });
            },
            { border: C.rule }
          );
          break;
        case 'bullets':
          list(block.items, margin, width);
          break;
        case 'phase':
          // Never a phase label alone at the foot of a page.
          ensure(120);
          pdf.moveDown(0.6);
          caps(block.text, margin, 8, accent);
          pdf.save().lineWidth(0.5).strokeColor(hex(C.rule)).moveTo(margin, pdf.y + 2).lineTo(margin + width, pdf.y + 2).stroke().restore();
          pdf.moveDown(0.6);
          break;
        case 'quote': {
          const top = pdf.y;
          text(block.text, margin + 34, width - 34, { font: F.serifItalic, italicFont: F.serifItalic, boldFont: F.serifBold, size: 10.5 });
          pdf.save().lineWidth(1).strokeColor(hex(C.rule)).moveTo(margin + 24, top).lineTo(margin + 24, pdf.y).stroke().restore();
          pdf.moveDown(0.4);
          break;
        }
        case 'step': {
          ensure(70);
          pdf.moveDown(0.5);
          const top = pdf.y;
          pdf.font(F.serifItalic).fontSize(15).fillColor(accent).text(block.num, margin, top - 2, { width: 20 });
          pdf.font(F.serifBold).fontSize(12).fillColor(hex(C.ink)).text(block.title, margin + 22, top, { width: width - 22, continued: Boolean(block.minutes) });
          if (block.minutes) pdf.font(F.sans).fontSize(9).fillColor(hex(C.stone)).text(`  ·  ${block.minutes} min`);
          // The minutes end the line at their own, smaller size.
          pdf.y = Math.max(pdf.y, top + 17);
          if (block.slides) {
            pdf.font(F.sansBold).fontSize(7.5).fillColor(hex(C.stone)).text('SLIDES   ', margin + 22, pdf.y, { characterSpacing: 1, continued: true });
            pdf.font(F.sans).fontSize(9).text(block.slides, { characterSpacing: 0 });
            pdf.moveDown(0.25);
          }
          for (const para of block.paras) {
            text(para, margin + 22, width - 22);
            pdf.moveDown(0.3);
          }
          (block.items ?? []).forEach((item, index) => {
            const y = pdf.y;
            pdf.font(F.sans).fontSize(10).fillColor(accent).text(`${String.fromCharCode(97 + index)}.`, margin + 30, y);
            pdf.y = y;
            text(typeof item === 'string' ? item : item.t, margin + 46, width - 46);
            if (typeof item !== 'string') {
              item.sub.forEach((sub, subIndex) => {
                const subY = pdf.y;
                pdf.font(F.sans).fontSize(10).fillColor(hex(C.stone)).text(`${['i', 'ii', 'iii', 'iv', 'v', 'vi'][subIndex] ?? subIndex + 1}.`, margin + 50, subY);
                pdf.y = subY;
                text(sub, margin + 66, width - 66);
              });
            }
          });
          if (block.after?.length) render(block.after);
          break;
        }
      }
    }
  };
  render(plan.body);

  const range = pdf.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    pdf.switchToPage(index);
    // Writing in the bottom margin would otherwise start a new page.
    pdf.page.margins.bottom = 0;
    const footer = `${KIT_PLAN_PROGRAM} | ${plan.footer} | Page ${index + 1}`;
    pdf.font(F.sans).fontSize(7.5).fillColor(hex(C.stone)).text(footer, margin, pdf.page.height - margin + 6, { width, align: 'center', lineBreak: false });
  }
  pdf.end();
  return new Uint8Array(await done);
}
