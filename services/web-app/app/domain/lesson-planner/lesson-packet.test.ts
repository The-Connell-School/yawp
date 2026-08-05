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
