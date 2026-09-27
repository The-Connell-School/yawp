import { describe, expect, test } from 'bun:test';
import {
  buildLessonPacket,
  deriveSectionKind,
  deriveSectionTitle,
  parsePacketAudience,
  PACKET_AUDIENCES,
} from './lesson-packet';

describe('deriveSectionTitle', () => {
  test('uses the first Markdown heading', () => {
    expect(deriveSectionTitle('## Warm-up (5 min)\n\nDo the thing.', 0)).toBe(
      'Warm-up (5 min)'
    );
  });

  test('prefers the first heading at any level', () => {
    expect(deriveSectionTitle('# Conclusions lesson\n\n## Warm-up', 0)).toBe(
      'Conclusions lesson'
    );
  });

  test('falls back to the opening sentence when there is no heading', () => {
    expect(
      deriveSectionTitle(
        'Students sort strong and weak topic sentences. Then they revise.',
        0
      )
    ).toBe('Students sort strong and weak topic sentences.');
  });

  test('truncates a long fallback rather than printing a paragraph as a title', () => {
    const title = deriveSectionTitle(`${'word '.repeat(60)}.`, 0);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith('…')).toBe(true);
  });

  test('falls back to a numbered section when there is no usable text', () => {
    expect(deriveSectionTitle('   ', 2)).toBe('Section 3');
  });

  test('strips Markdown emphasis out of the title', () => {
    expect(deriveSectionTitle('## **Warm-up** for _everyone_', 0)).toBe(
      'Warm-up for everyone'
    );
  });
});

describe('deriveSectionKind', () => {
  test('calls a student-facing section a handout', () => {
    expect(deriveSectionKind('Rewrite each conclusion.', 'student')).toBe(
      'handout'
    );
  });

  test('recognizes a slide deck by the shape the prompt asks for', () => {
    const deck =
      '## Slide 1 — Why conclusions matter\n\nSpeaker notes: open here.';
    expect(deriveSectionKind(deck, 'teacher')).toBe('slides');
    // A deck is a deck even when it is meant for the class to see.
    expect(deriveSectionKind(deck, 'student')).toBe('slides');
  });

  test('recognizes a structured deck, which is the real signal', () => {
    const deck = JSON.stringify({
      title: 'A deck',
      slides: [
        { layout: 'statement', title: 'One', body: 'Two', speakerNotes: 'Go.' },
      ],
    });
    const content = `Here it is.\n\n\`\`\`yawp-slides\n${deck}\n\`\`\``;
    expect(deriveSectionKind(content, 'teacher')).toBe('slides');
  });

  test('treats everything else as part of the plan', () => {
    expect(deriveSectionKind('## Warm-up (5 min)\n\nDo this.', 'teacher')).toBe(
      'plan'
    );
  });

  test('does not mistake prose about slides for a deck', () => {
    expect(
      deriveSectionKind('Project the slide while they write.', 'teacher')
    ).toBe('plan');
  });
});

describe('parsePacketAudience', () => {
  test('accepts the known audiences', () => {
    for (const audience of PACKET_AUDIENCES) {
      expect(parsePacketAudience(audience)).toBe(audience);
    }
  });

  test('defaults anything else to the teacher-facing plan', () => {
    expect(parsePacketAudience(null)).toBe('teacher');
    expect(parsePacketAudience('parents')).toBe('teacher');
  });
});

describe('buildLessonPacket', () => {
  const sections = [
    {
      id: 'm1',
      content:
        '## Warm-up (5 min)\n\nDaily Pages prompt FW-001.\n\n### Teacher moves\n\nCircle the room.',
      keptAudience: 'teacher',
    },
    {
      id: 'm2',
      content:
        '## Conclusion practice handout\n\nRewrite each conclusion.\n\n```suggestions\nBuild the deck\n```',
      keptAudience: 'student',
    },
  ];

  const packet = buildLessonPacket({
    title: 'Conclusions that answer "so what?"',
    className: 'English 10 · Period 3',
    sections,
  });

  test('carries the lesson name and class onto the document', () => {
    expect(packet.title).toBe('Conclusions that answer "so what?"');
    expect(packet.className).toBe('English 10 · Period 3');
  });

  test('keeps the sections in order with derived titles', () => {
    expect(packet.sections.map((section) => section.title)).toEqual([
      'Warm-up (5 min)',
      'Conclusion practice handout',
    ]);
  });

  test('strips the suggestions block so chat affordances never print', () => {
    expect(packet.sections[1]!.content).not.toContain('suggestions');
    expect(packet.sections[1]!.content).not.toContain('Build the deck');
  });

  test('marks student-facing sections so they print as handouts', () => {
    expect(packet.sections[0]!.audience).toBe('teacher');
    expect(packet.sections[1]!.audience).toBe('student');
  });

  test('reads the minutes out of a section title for the outline', () => {
    expect(packet.outline[0]).toMatchObject({
      title: 'Warm-up (5 min)',
      minutes: 5,
    });
    expect(packet.outline[1]!.minutes).toBeNull();
  });

  test('totals the timed sections so the outline shows the period length', () => {
    expect(packet.totalMinutes).toBe(5);
  });

  test('lists the inner headings as outline steps', () => {
    expect(packet.outline[0]!.steps).toEqual(['Teacher moves']);
    expect(packet.outline[1]!.steps).toEqual([]);
  });

  test('does not repeat the section title inside the body', () => {
    // The title is derived from the reply's own leading heading, so rendering
    // both would print "Warm-up (5 min)" twice on paper.
    expect(packet.sections[0]!.title).toBe('Warm-up (5 min)');
    expect(packet.sections[0]!.content).not.toContain('# Warm-up (5 min)');
    expect(packet.sections[0]!.content).toContain('Daily Pages prompt FW-001');
    // Inner headings survive — only the duplicated title is removed.
    expect(packet.sections[0]!.content).toContain('### Teacher moves');
  });

  test('keeps a heading that is not the section title', () => {
    const [section] = buildLessonPacket({
      title: 'Lesson',
      className: null,
      sections: [
        {
          id: 'm1',
          content: 'Some framing prose.\n\n## Actually a heading',
          keptAudience: null,
        },
      ],
    }).sections;
    expect(section!.content).toContain('## Actually a heading');
  });

  test('still finds the outline steps after the title is removed', () => {
    expect(packet.outline[0]!.steps).toEqual(['Teacher moves']);
  });

  test('gives every section a stable anchor for jump links', () => {
    expect(packet.sections[0]!.anchor).toBe('resource-m1');
    expect(packet.sections[1]!.anchor).toBe('resource-m2');
    expect(packet.outline[0]!.anchor).toBe('resource-m1');
  });

  test('labels each section with its kind', () => {
    expect(packet.sections.map((section) => section.kind)).toEqual([
      'plan',
      'handout',
    ]);
  });

  test('prefers a teacher-supplied resource name over the derived one', () => {
    const [section] = buildLessonPacket({
      title: 'Lesson',
      className: null,
      sections: [
        {
          id: 'm1',
          content: '## Warm-up (5 min)\n\nDo this.',
          keptAudience: 'teacher',
          keptTitle: '  Bell-ringer  ',
        },
      ],
    }).sections;
    expect(section!.title).toBe('Bell-ringer');
    // The heading it replaced is still removed from the body.
    expect(section!.content).not.toContain('# Warm-up');
  });

  test('ignores a blank teacher name and falls back to the derived title', () => {
    const [section] = buildLessonPacket({
      title: 'Lesson',
      className: null,
      sections: [
        {
          id: 'm1',
          content: '## Warm-up (5 min)\n\nDo this.',
          keptAudience: 'teacher',
          keptTitle: '   ',
        },
      ],
    }).sections;
    expect(section!.title).toBe('Warm-up (5 min)');
  });

  test('still reads minutes from the derived title when renamed', () => {
    const renamed = buildLessonPacket({
      title: 'Lesson',
      className: null,
      sections: [
        {
          id: 'm1',
          content: '## Warm-up (5 min)\n\nDo this.',
          keptAudience: 'teacher',
          keptTitle: 'Bell-ringer',
        },
      ],
    });
    // The timing belongs to the lesson, not to whatever the teacher called it.
    expect(renamed.outline[0]!.minutes).toBe(5);
    expect(renamed.totalMinutes).toBe(5);
  });

  test('falls back to the conversation title when the packet is unnamed', () => {
    expect(
      buildLessonPacket({ title: '', className: null, sections: [] }).title
    ).toBe('Lesson plan');
  });

  test('reports an empty packet rather than rendering a blank page', () => {
    const empty = buildLessonPacket({
      title: 'Nothing kept',
      className: null,
      sections: [],
    });
    expect(empty.sections).toEqual([]);
    expect(empty.outline).toEqual([]);
    expect(empty.totalMinutes).toBe(0);
  });

  test('counts a range of minutes by its upper bound', () => {
    const ranged = buildLessonPacket({
      title: 'Lesson',
      className: null,
      sections: [
        {
          id: 'm1',
          content: '## Discussion (10-15 minutes)',
          keptAudience: null,
        },
      ],
    });
    expect(ranged.outline[0]!.minutes).toBe(15);
  });
});

describe('buildLessonPacket — materials kept on their own', () => {
  const packet = buildLessonPacket({
    title: 'Evidence lesson',
    className: 'English 10 · Period 3',
    sections: [
      {
        id: 'msg-1',
        content: '## Lesson Sequence\n\nWarm-up, mini-lesson, practice.',
        keptAudience: 'teacher',
      },
      {
        id: 'material-1',
        content: '## Diagnose & Repair\n\nRead each excerpt.',
        keptAudience: 'student',
        // A material knows what it is; nothing has to be guessed from the text.
        kind: 'handout',
        origin: 'material',
      },
    ],
  });

  test('prints a kept handout beside the plan it came from', () => {
    expect(packet.sections.map((section) => section.title)).toEqual([
      'Lesson Sequence',
      'Diagnose & Repair',
    ]);
    expect(packet.sections[1]!.audience).toBe('student');
  });

  test('takes the material at its word about what it is', () => {
    expect(packet.sections[1]!.kind).toBe('handout');
    expect(packet.outline[1]!.kind).toBe('handout');
  });

  test('says which sections came from a reply and which are materials', () => {
    // The page offers rename on a kept reply; a material carries its own name.
    expect(packet.sections[0]!.origin).toBe('reply');
    expect(packet.sections[1]!.origin).toBe('material');
  });

  test('is not marked edited when nothing has been hand-edited', () => {
    expect(packet.sections[0]!.edited).toBe(false);
    expect(packet.sections[1]!.edited).toBe(false);
  });

  /**
   * `editedAt` is what tells the stack a material was hand-edited and should
   * no longer be silently replaced by a later revision from the model.
   */
  test('marks a material edited once it carries an editedAt', () => {
    const edited = buildLessonPacket({
      title: 'Evidence lesson',
      className: null,
      sections: [
        {
          id: 'material-1',
          content:
            '## Diagnose & Repair\n\nRead each excerpt, revised by hand.',
          keptAudience: 'student',
          kind: 'handout',
          origin: 'material',
          editedAt: new Date('2026-08-18T10:00:00.000Z'),
        },
      ],
    });
    expect(edited.sections[0]!.edited).toBe(true);
  });
});

describe('buildLessonPacket — a kept reply that carries materials', () => {
  const reply = [
    '## Lesson Sequence',
    '',
    'Project the drafts, then hand out the practice set.',
    '',
    '```yawp-material',
    'kind: sample',
    'title: Two Drafts',
    '---',
    '## Two Drafts',
    '',
    '### Draft A',
    'In conclusion, this essay has shown many things.',
    '```',
  ].join('\n');

  const packet = buildLessonPacket({
    title: 'Evidence lesson',
    className: null,
    sections: [{ id: 'msg-1', content: reply, keptAudience: 'teacher' }],
  });

  test('never prints the block as raw text', () => {
    // What shipped: the header and body rendered as a code block in the packet.
    expect(packet.sections[0]!.content).not.toContain('yawp-material');
    expect(packet.sections[0]!.content).not.toContain('kind: sample');
    expect(packet.sections[0]!.content).toContain('Project the drafts');
  });

  test('keeps the material with the section so nothing is lost', () => {
    const [material] = packet.sections[0]!.materials;
    expect(material!.title).toBe('Two Drafts');
    expect(material!.content).toContain('Draft A');
  });

  test('does not read the material’s headings as steps of the lesson', () => {
    // "Two Drafts" and "Draft A" are inside a handout, not stages of the class.
    expect(packet.outline[0]!.steps).toEqual([]);
  });
});

describe('buildLessonPacket — a kept reply that asked with controls', () => {
  test('never prints the control request as text', () => {
    const packet = buildLessonPacket({
      title: 'Lesson',
      className: null,
      sections: [
        {
          id: 'msg-1',
          content:
            '## Before I plan\n\nWhich class is this for?\n\n```yawp-ask\nminutes: 50\nactivities\n```',
          keptAudience: 'teacher',
        },
      ],
    });

    expect(packet.sections[0]!.content).not.toContain('yawp-ask');
    expect(packet.sections[0]!.content).not.toContain('minutes: 50');
    expect(packet.sections[0]!.content).toContain('Which class is this for?');
  });
});

describe('buildLessonPacket — a kept reply that ends on an exit ticket', () => {
  test('prints the words students read, not the answers it was built from', () => {
    // On paper there is no button to press, so the ticket has to arrive as
    // lesson content. The teacher-only notes are an answer key: printing them
    // on a page a student might see would give the answer away.
    const packet = buildLessonPacket({
      title: 'Lesson',
      className: null,
      sections: [
        {
          id: 'msg-1',
          content:
            '## Closing (4 min)\n\nHand this out with two minutes left.\n\n```yawp-exit-ticket\nmode: specific\nfocus: explain-concept\ntopic: the difference between weathering and erosion\nanswer: objective\nmustMention: Whether the material moves.\n```',
          keptAudience: 'teacher',
        },
      ],
    });

    const printed = packet.sections[0]!.content;
    expect(printed).not.toContain('yawp-exit-ticket');
    expect(printed).not.toContain('focus:');
    expect(printed).not.toContain('Whether the material moves');
    expect(printed).toContain('the difference between weathering and erosion');
    expect(printed).toContain('Hand this out with two minutes left.');
  });
});

describe('buildLessonPacket — a kept reply that assigns writing practice', () => {
  test('prints what was assigned, by the lesson’s own name, not the fence', () => {
    const packet = buildLessonPacket({
      title: 'Lesson',
      className: null,
      practiceLessonTitles: { 'fixing-comma-splices': 'Fixing Comma Splices' },
      sections: [
        {
          id: 'msg-1',
          content:
            '## Practice (10 min)\n\nThey repair their own.\n\n```yawp-practice\nlessons: fixing-comma-splices\nproblems: 6\n```',
          keptAudience: 'teacher',
        },
      ],
    });

    const printed = packet.sections[0]!.content;
    expect(printed).not.toContain('yawp-practice');
    expect(printed).not.toContain('lessons:');
    expect(printed).toContain('Fixing Comma Splices');
    expect(printed).toContain('6 problems');
  });
});

const DECK = {
  title: 'Beyond the Quote',
  subtitle: 'English 11 · Writing analysis that argues',
  slides: [
    {
      layout: 'title',
      title: 'Beyond the Quote',
      subtitle: 'Writing analysis that actually argues',
      speakerNotes: 'Let the title sit for a beat before you say anything.',
      minutes: 1,
    },
    {
      layout: 'bullets',
      title: 'The three moves',
      bullets: ['Interpret', 'Connect', 'Push'],
      speakerNotes: 'Name each move, then show it.',
      minutes: 6,
    },
  ],
};

function replyWithDeck(prose: string): string {
  return `${prose}\n\n\`\`\`yawp-slides\n${JSON.stringify(DECK, null, 2)}\n\`\`\``;
}

describe('buildLessonPacket — a kept reply that carries a deck', () => {
  function packetWithDeck(prose = "## Beyond the Quote\n\nHere's the deck.") {
    return buildLessonPacket({
      title: 'Lesson',
      className: null,
      sections: [
        { id: 'msg-1', content: replyWithDeck(prose), keptAudience: 'teacher' },
      ],
    });
  }

  test('parses the deck once, into the section', () => {
    const section = packetWithDeck().sections[0]!;

    expect(section.deck?.title).toBe('Beyond the Quote');
    expect(section.deck?.slides).toHaveLength(2);
  });

  // The bug this whole change exists for: every renderer used to re-parse the
  // raw fence, and the PDF forgot to, so a teacher downloaded four pages of
  // JSON.
  test('takes the JSON out of the printable content', () => {
    const section = packetWithDeck().sections[0]!;

    expect(section.content).not.toContain('yawp-slides');
    expect(section.content).not.toContain('"layout"');
    expect(section.content).not.toContain('speakerNotes');
    expect(section.content).toContain("Here's the deck.");
  });

  test('is still a slides section once the fence is gone', () => {
    expect(packetWithDeck().sections[0]!.kind).toBe('slides');
    expect(packetWithDeck().outline[0]!.kind).toBe('slides');
  });

  test('names a deck-only reply after the deck, not after its fence', () => {
    const section = packetWithDeck('').sections[0]!;

    expect(section.title).toBe('Beyond the Quote');
    expect(section.content).toBe('');
  });

  test('a teacher-supplied name still wins over the deck title', () => {
    const packet = buildLessonPacket({
      title: 'Lesson',
      className: null,
      sections: [
        {
          id: 'msg-1',
          content: replyWithDeck(''),
          keptAudience: 'teacher',
          keptTitle: 'Tuesday opener',
        },
      ],
    });

    expect(packet.sections[0]!.title).toBe('Tuesday opener');
  });

  test('a deck the schema rejected leaves no JSON behind either', () => {
    const packet = buildLessonPacket({
      title: 'Lesson',
      className: null,
      sections: [
        {
          id: 'msg-1',
          content:
            '## Broken\n\nHere.\n\n```yawp-slides\n{ "title": "No slides at all", "slides": [] }\n```',
          keptAudience: 'teacher',
        },
      ],
    });

    const section = packet.sections[0]!;
    expect(section.deck).toBeNull();
    // Told apart from "no deck at all", so the page can say it didn't build.
    expect(section.deckFailed).toBe(true);
    expect(section.content).not.toContain('"slides"');
    expect(section.content).toContain('Here.');
  });

  test('a reply with no deck is untouched', () => {
    const packet = buildLessonPacket({
      title: 'Lesson',
      className: null,
      sections: [
        {
          id: 'msg-1',
          content: '## Warm-up (5 min)\n\nSort the sentences.',
          keptAudience: 'teacher',
        },
      ],
    });

    expect(packet.sections[0]!.deck).toBeNull();
    expect(packet.sections[0]!.deckFailed).toBe(false);
    expect(packet.sections[0]!.content).toContain('Sort the sentences.');
  });
});
