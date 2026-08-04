import { describe, expect, test } from 'bun:test';
import {
  buildLessonPacket,
  deriveSectionTitle,
  parsePacketAudience,
  PACKET_AUDIENCES,
} from './lesson-packet';

describe('deriveSectionTitle', () => {
  test('uses the first Markdown heading', () => {
    expect(
      deriveSectionTitle('## Warm-up (5 min)\n\nDo the thing.', 0)
    ).toBe('Warm-up (5 min)');
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
        { id: 'm1', content: '## Discussion (10-15 minutes)', keptAudience: null },
      ],
    });
    expect(ranged.outline[0]!.minutes).toBe(15);
  });
});
