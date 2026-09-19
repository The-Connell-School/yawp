import { describe, expect, test } from 'bun:test';
import { inflateSync } from 'node:zlib';
import { buildLessonPacket } from './lesson-packet';
import {
  pdfFilename,
  printsForStudents,
  tableRowBottom,
  renderHandoutPdf,
  renderPacketPdf,
} from './lesson-pdf.server';

function packetWith(
  sections: Array<{
    id: string;
    content: string;
    keptAudience?: string | null;
    keptTitle?: string | null;
  }>
) {
  return buildLessonPacket({
    title: 'Evidence that earns its place',
    className: 'English 10 · Period 3',
    sections: sections.map((section) => ({
      id: section.id,
      content: section.content,
      keptAudience: section.keptAudience ?? 'teacher',
      keptTitle: section.keptTitle ?? null,
      origin: 'reply' as const,
    })),
  });
}

/**
 * The words a reader would show, pulled back out of the file.
 *
 * Page content is deflated, and inside it the text sits hex-encoded in kerned
 * `TJ` arrays — "Under" and "line" arrive as separate chunks with a spacing
 * number between them. Joining the chunks in order puts the sentence back.
 */
function pdfText(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  const raw = buffer.toString('latin1');
  let text = '';

  const streams = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = streams.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    let content: string;
    try {
      content = inflateSync(buffer.subarray(start, end)).toString('latin1');
    } catch {
      // Not a deflated stream (fonts, metadata) — nothing to read here.
      continue;
    }
    for (const hex of content.matchAll(/<([0-9a-fA-F]+)>/g)) {
      text += Buffer.from(hex[1]!, 'hex').toString('latin1');
    }
    text += '\n';
  }

  return text;
}

/** The file's own metadata, which is where the document title lands. */
function pdfMetadata(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

describe('renderPacketPdf', () => {
  test('produces a real PDF file', async () => {
    const bytes = await renderPacketPdf(
      packetWith([
        { id: 's1', content: '## Warm-up\n\nFour minutes of writing.' },
      ])
    );
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
    // A trailer means the document was finished rather than cut off.
    expect(pdfMetadata(bytes)).toContain('%%EOF');
    expect(bytes.length).toBeGreaterThan(1000);
  });

  test('names the document after the lesson', async () => {
    const bytes = await renderPacketPdf(
      packetWith([{ id: 's1', content: '## Warm-up\n\nWrite.' }])
    );
    expect(pdfMetadata(bytes)).toContain('Evidence that earns its place');
  });

  test('grows a page at a time rather than truncating a long lesson', async () => {
    const short = await renderPacketPdf(
      packetWith([{ id: 's1', content: 'One line.' }])
    );
    const long = await renderPacketPdf(
      packetWith([
        {
          id: 's1',
          content: Array.from(
            { length: 200 },
            (_unused, index) =>
              `Paragraph ${index + 1}: rewrite this conclusion so it answers "so what?".`
          ).join('\n\n'),
        },
      ])
    );
    expect(long.length).toBeGreaterThan(short.length * 3);
  });

  test('gives every filed resource its own page', async () => {
    const bytes = await renderPacketPdf(
      packetWith([
        { id: 's1', content: '## Warm-up\n\nWrite.' },
        { id: 's2', content: '## Mini-lesson\n\nModel it.' },
      ])
    );
    // Two sections, two pages, plus the catalog entry for each.
    expect(pdfMetadata(bytes).match(/\/Type\s*\/Page[^s]/g)?.length).toBe(2);
  });

  test('survives a section whose content is empty', async () => {
    const bytes = await renderPacketPdf(
      packetWith([{ id: 's1', content: '' }])
    );
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
  });

  test('renders a lesson with no sections at all', async () => {
    const bytes = await renderPacketPdf(packetWith([]));
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
  });

  test('lays out every Markdown shape a lesson uses without throwing', async () => {
    const bytes = await renderPacketPdf(
      packetWith([
        {
          id: 's1',
          content: [
            '## Sequence',
            '',
            'Give them **four minutes**, then *share*.',
            '',
            '> What made it land?',
            '',
            '1. Write',
            '2. Share',
            '   - in pairs',
            '',
            '---',
            '',
            '| Time | Move |',
            '| --- | --- |',
            '| 5 min | Quick write |',
            '',
            'Open [the deck](/app/decks/1).',
          ].join('\n'),
        },
      ])
    );
    expect(pdfMetadata(bytes)).toContain('%%EOF');
  });
});

describe('renderHandoutPdf', () => {
  test('prints the student pieces and not the teacher’s plan', async () => {
    const packet = packetWith([
      { id: 's1', content: '## Teacher plan\n\nCircle the room.' },
      {
        id: 's2',
        content: '## Practice\n\nUnderline the sentence that proves it.',
        keptAudience: 'student',
      },
    ]);
    const text = pdfText(await renderHandoutPdf({ packet }));
    expect(text).toContain('Underline the sentence');
    expect(text).not.toContain('Circle the room');
  });

  test('leaves out what the teacher excluded', async () => {
    const packet = packetWith([
      {
        id: 's1',
        content: '## Warm-up\n\nStudent warm-up.',
        keptAudience: 'student',
      },
      {
        id: 's2',
        content: '## Exit\n\nStudent exit ticket.',
        keptAudience: 'student',
      },
    ]);
    const text = pdfText(await renderHandoutPdf({ packet, excluded: ['s1'] }));
    expect(text).not.toContain('Student warm-up');
    expect(text).toContain('Student exit ticket');
  });

  test('gives students somewhere to put their name, section and date', async () => {
    // Section as well as name: a teacher running five periods gets back five
    // piles of the same worksheet, and a page carrying only a name cannot be
    // sorted back into the class it came from.
    const packet = packetWith([
      { id: 's1', content: '## Practice\n\nWrite.', keptAudience: 'student' },
    ]);
    const text = pdfText(await renderHandoutPdf({ packet }));
    expect(text).toContain('Name:');
    expect(text).toContain('Section:');
    expect(text).toContain('Date:');
  });

  test('still produces a file when nothing is marked for students', async () => {
    const packet = packetWith([
      { id: 's1', content: '## Plan\n\nTeacher only.' },
    ]);
    const bytes = await renderHandoutPdf({ packet });
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-');
    expect(pdfText(bytes)).toContain('Nothing in this lesson is marked');
  });

  test('renders one piece alone, ignoring exclusions', async () => {
    // `only` is how a teacher gets pieces as separate files instead of one
    // combined handout — it must win even over an exclusion, since asking for
    // a piece by name and getting nothing back would be a worse bug than the
    // exclusion being ignored.
    const packet = packetWith([
      {
        id: 's1',
        content: '## Warm-up\n\nStudent warm-up.',
        keptAudience: 'student',
      },
      {
        id: 's2',
        content: '## Exit\n\nStudent exit ticket.',
        keptAudience: 'student',
      },
    ]);
    const text = pdfText(
      await renderHandoutPdf({ packet, excluded: ['s2'], only: 's2' })
    );
    expect(text).toContain('Student exit ticket');
    expect(text).not.toContain('Student warm-up');
  });

  test('drops the numbering on a piece rendered alone', async () => {
    // "1. Exit Ticket" reads like something is missing when the ticket is the
    // whole document rather than the first of several.
    const packet = packetWith([
      {
        id: 's1',
        content: '## Exit\n\nStudent exit ticket.',
        keptAudience: 'student',
        keptTitle: 'Exit Ticket',
      },
    ]);
    const text = pdfText(await renderHandoutPdf({ packet, only: 's1' }));
    expect(text).toContain('Exit Ticket');
    expect(text).not.toContain('1. Exit Ticket');
  });

  test('still carries name, section and date when rendered alone', async () => {
    const packet = packetWith([
      { id: 's1', content: '## Practice\n\nWrite.', keptAudience: 'student' },
    ]);
    const text = pdfText(await renderHandoutPdf({ packet, only: 's1' }));
    expect(text).toContain('Name:');
    expect(text).toContain('Section:');
  });
});

describe('pdfFilename', () => {
  test('names the file after the lesson', () => {
    expect(pdfFilename('Evidence that earns its place')).toBe(
      'Evidence that earns its place.pdf'
    );
  });

  test('marks the handout as the handout', () => {
    expect(pdfFilename('Conclusions', 'Student handout')).toBe(
      'Conclusions - Student handout.pdf'
    );
  });

  test('stays inside ASCII for the part it controls', () => {
    // Chromium drops the whole Content-Disposition name on a character it
    // dislikes and saves the file as "download" instead.
    // eslint-disable-next-line no-control-regex
    expect(pdfFilename('Conclusions', 'Student handout')).toMatch(
      /^[\x20-\x7e]+$/
    );
  });

  test('takes out characters a filesystem will not accept', () => {
    expect(pdfFilename('What/now: "so what?"')).toBe('Whatnow so what.pdf');
  });

  test('falls back rather than producing a nameless file', () => {
    expect(pdfFilename('')).toBe('Lesson.pdf');
    expect(pdfFilename('///')).toBe('Lesson.pdf');
  });

  test('keeps the name short enough to save', () => {
    expect(pdfFilename('x'.repeat(300)).length).toBeLessThanOrEqual(84);
  });
});

describe('renderPacketPdf — what reaches the page', () => {
  test('typesets quotation marks rather than their HTML escapes', async () => {
    const bytes = await renderPacketPdf(
      packetWith([{ id: 's1', content: 'Answer "so what?" in one sentence.' }])
    );
    const text = pdfText(bytes);
    expect(text).toContain('so what?');
    expect(text).not.toContain('&quot;');
    expect(text).not.toContain('&#39;');
  });

  test('keeps an apostrophe an apostrophe', async () => {
    const bytes = await renderPacketPdf(
      packetWith([{ id: 's1', content: "Read the author's claim." }])
    );
    expect(pdfText(bytes)).not.toContain('&');
  });
});

describe('tableRowBottom — a worksheet needs somewhere to write', () => {
  test('opens an empty row up to a writable height', () => {
    // A table of blank cells is a teacher building a worksheet. Sized to its
    // content it collapses to a line of nothing.
    expect(tableRowBottom(100, 112, false)).toBe(126);
  });

  test('lets a full row keep its own height', () => {
    expect(tableRowBottom(100, 180, false)).toBe(180);
  });

  test('leaves the header hugging its text', () => {
    expect(tableRowBottom(100, 112, true)).toBe(112);
  });
});

describe('printsForStudents', () => {
  test('the handout view is for students', () => {
    expect(printsForStudents({ wantsHandout: true })).toBe(true);
  });

  test('so is one student-facing piece downloaded on its own', () => {
    // A teacher saves just the warm-up or just the exit ticket far more often
    // than the whole packet, and that sheet still goes out to thirty kids.
    expect(
      printsForStudents({
        wantsHandout: false,
        singleSectionAudience: 'student',
      })
    ).toBe(true);
  });

  test('the teacher’s own plan is not', () => {
    expect(
      printsForStudents({
        wantsHandout: false,
        singleSectionAudience: 'teacher',
      })
    ).toBe(false);
    expect(printsForStudents({ wantsHandout: false })).toBe(false);
    expect(
      printsForStudents({ wantsHandout: false, singleSectionAudience: null })
    ).toBe(false);
  });
});

/**
 * A deck on paper.
 *
 * The packet hands the PDF a parsed deck, and until it did, this renderer
 * passed the raw `yawp-slides` fence to the Markdown drawer — so "save as PDF"
 * on a lesson with slides produced pages of Courier-set JSON. What a teacher
 * wants on paper is the notes view: each slide, what is on it, and what they
 * planned to say.
 */
describe('renderPacketPdf — a section that carries a deck', () => {
  const DECK_REPLY = `## Beyond the Quote

Here's the deck for tomorrow.

\`\`\`yawp-slides
${JSON.stringify(
  {
    title: 'Beyond the Quote',
    subtitle: 'English 11 · Analysis that argues',
    slides: [
      {
        layout: 'title',
        title: 'Beyond the Quote',
        subtitle: 'Writing analysis that actually argues',
        speakerNotes: 'Let the title sit for a beat before you say anything.',
        minutes: 1,
      },
      {
        layout: 'compare',
        title: "What's the difference?",
        left: { label: 'Version A', text: 'The door slammed.' },
        right: { label: 'Version B', text: 'When the door slams, she is done.' },
        speakerNotes: 'Three silent minutes of writing before anyone speaks.',
        minutes: 5,
      },
      {
        layout: 'bullets',
        title: 'The three moves',
        bullets: ['Interpret', 'Connect', 'Push further'],
        speakerNotes: 'Name each move, then show it in the model paragraph.',
        minutes: 6,
      },
      {
        layout: 'quote',
        title: 'Read it again',
        body: 'This shows that the door slammed.',
        attribution: 'a paragraph that stops too early',
        speakerNotes: 'Ask what that sentence added. Wait them out.',
      },
    ],
  },
  null,
  2
)}
\`\`\``;

  async function deckPdfText() {
    return pdfText(
      await renderPacketPdf(packetWith([{ id: 's1', content: DECK_REPLY }]))
    );
  }

  test('never prints the JSON', async () => {
    const text = await deckPdfText();

    expect(text).not.toContain('yawp-slides');
    expect(text).not.toContain('"layout"');
    expect(text).not.toContain('speakerNotes');
    expect(text).not.toContain('{');
  });

  test('keeps the prose that came with the deck', async () => {
    expect(await deckPdfText()).toContain("Here's the deck for tomorrow.");
  });

  test('prints every slide, numbered and in order', async () => {
    const text = await deckPdfText();

    expect(text).toContain('Beyond the Quote');
    expect(text).toContain("What's the difference?");
    expect(text).toContain('The three moves');
    expect(text).toContain('Read it again');
    expect(text.indexOf('The three moves')).toBeGreaterThan(
      text.indexOf("What's the difference?")
    );
  });

  test('prints what is actually on each slide', async () => {
    const text = await deckPdfText();

    // Both columns of a compare, both labels.
    expect(text).toContain('Version A');
    expect(text).toContain('The door slammed.');
    expect(text).toContain('Version B');
    // Bullets, the subtitle of a title slide, a quote and its attribution.
    expect(text).toContain('Interpret');
    expect(text).toContain('Push further');
    expect(text).toContain('Writing analysis that actually argues');
    expect(text).toContain('a paragraph that stops too early');
  });

  // The reason a teacher prints a deck at all: the notes are the lesson.
  test('prints the speaker notes', async () => {
    const text = await deckPdfText();

    expect(text).toContain('Let the title sit for a beat');
    expect(text).toContain('Three silent minutes of writing');
    expect(text).toContain('Wait them out.');
  });

  test('carries each slide’s timing', async () => {
    expect(await deckPdfText()).toContain('5 min');
  });

  test('a deck that failed to validate prints its prose, not its braces', async () => {
    const text = pdfText(
      await renderPacketPdf(
        packetWith([
          {
            id: 's1',
            content:
              '## Broken\n\nThe lesson still stands.\n\n```yawp-slides\n{ "title": "Nope", "slides": [] }\n```',
          },
        ])
      )
    );

    expect(text).toContain('The lesson still stands.');
    expect(text).not.toContain('"slides"');
  });
});
