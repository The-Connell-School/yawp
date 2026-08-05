import { describe, expect, test } from 'bun:test';
import {
  deckAsMaterial,
  MATERIAL_FENCE,
  readLessonMaterials,
  hasLessonMaterials,
} from './lesson-material';

function fenced(body: string): string {
  return `\`\`\`${MATERIAL_FENCE}\n${body}\n\`\`\``;
}

const handout = `kind: handout
title: Diagnose & Repair (3 excerpts)
---
## Diagnose & Repair

Read each excerpt. Mark where the writer stopped explaining.

1. "The author says the door slammed."`;

describe('readLessonMaterials', () => {
  test('pulls a handout out of the lesson as its own thing', () => {
    const reply = `Here is the lesson.\n\n${fenced(handout)}\n\nWant a deck too?`;
    const { materials, body } = readLessonMaterials(reply);

    expect(materials).toHaveLength(1);
    expect(materials[0]!.kind).toBe('handout');
    expect(materials[0]!.title).toBe('Diagnose & Repair (3 excerpts)');
    expect(materials[0]!.content).toContain('Mark where the writer stopped');
    // A handout is for students, so the packet prints it with room to write.
    expect(materials[0]!.audience).toBe('student');

    // The block itself never renders as text — the card replaces it.
    expect(body).toContain('Here is the lesson.');
    expect(body).toContain('Want a deck too?');
    expect(body).not.toContain('kind: handout');
    expect(body).not.toContain(MATERIAL_FENCE);
  });

  test('keeps each material addressable so adding one twice is the same add', () => {
    const reply = `${fenced(handout)}\n\n${fenced('kind: exit-ticket\n---\nWrite one sentence.')}`;
    const { materials } = readLessonMaterials(reply);
    expect(materials.map((material) => material.key)).toEqual(['0', '1']);
  });

  test('sends teacher-facing material to the teacher side of the packet', () => {
    const { materials } = readLessonMaterials(
      fenced('kind: answer-key\ntitle: Key\n---\n1. b\n2. a')
    );
    expect(materials[0]!.audience).toBe('teacher');
  });

  test('lets the header override the audience a kind implies', () => {
    const { materials } = readLessonMaterials(
      fenced('kind: handout\naudience: teacher\ntitle: Notes\n---\nFor you.')
    );
    expect(materials[0]!.audience).toBe('teacher');
  });

  test('takes the title from the first heading when the header omits it', () => {
    const { materials } = readLessonMaterials(
      fenced('kind: sample\n---\n## Two conclusions, side by side\n\nA…')
    );
    expect(materials[0]!.title).toBe('Two conclusions, side by side');
  });

  test('falls back to naming the material after what it is', () => {
    const { materials } = readLessonMaterials(
      fenced('kind: exit-ticket\n---\nWrite one sentence.')
    );
    expect(materials[0]!.title).toBe('Exit ticket');
  });

  test('reads a block with no header at all as a handout', () => {
    const { materials } = readLessonMaterials(
      fenced('## Practice set\n\nRewrite each one.')
    );
    expect(materials[0]!.kind).toBe('handout');
    expect(materials[0]!.title).toBe('Practice set');
    expect(materials[0]!.content).toContain('Rewrite each one.');
  });

  test('treats a kind it does not know as a handout rather than dropping it', () => {
    const { materials } = readLessonMaterials(
      fenced('kind: worksheet-thing\ntitle: Something\n---\nBody.')
    );
    expect(materials).toHaveLength(1);
    expect(materials[0]!.kind).toBe('handout');
  });

  test('leaves a horizontal rule inside the material alone', () => {
    const { materials } = readLessonMaterials(
      fenced(
        'kind: handout\ntitle: Two parts\n---\nPart one.\n\n---\n\nPart two.'
      )
    );
    expect(materials[0]!.content).toContain('Part one.');
    expect(materials[0]!.content).toContain('---');
    expect(materials[0]!.content).toContain('Part two.');
  });

  test('drops a material with nothing in it', () => {
    expect(
      readLessonMaterials(fenced('kind: handout\ntitle: Empty\n---\n   '))
        .materials
    ).toHaveLength(0);
  });

  test('leaves an ordinary reply alone', () => {
    const reply = 'Just a plan.\n\n```\nconst x = 1;\n```';
    const { materials, body } = readLessonMaterials(reply);
    expect(materials).toHaveLength(0);
    expect(body).toBe(reply);
  });
});

describe('hasLessonMaterials', () => {
  test('is true only when the reply actually carries one', () => {
    expect(hasLessonMaterials(fenced(handout))).toBe(true);
    expect(hasLessonMaterials('Just a plan.')).toBe(false);
  });
});

describe('readLessonMaterials — what a material IS', () => {
  test('names a slot from what the material is, not where it came from', () => {
    const { materials } = readLessonMaterials(
      fenced('kind: handout\ntitle: Diagnose & Repair\n---\nRead each excerpt.')
    );
    expect(materials[0]!.slot).toBe('handout:diagnose-repair');
  });

  test('takes the slot the planner names, so a revision replaces the original', () => {
    const { materials } = readLessonMaterials(
      fenced(
        'kind: handout\nslot: handout:diagnose-repair\ntitle: Diagnose & Repair (v2)\n---\nShorter.'
      )
    );
    // A rewrite with a new title still lands in the same place.
    expect(materials[0]!.slot).toBe('handout:diagnose-repair');
  });

  test('keeps two different materials in two different slots', () => {
    const { materials } = readLessonMaterials(
      `${fenced('kind: handout\ntitle: Practice set\n---\nOne.')}\n\n${fenced(
        'kind: exit-ticket\ntitle: Practice set\n---\nTwo.'
      )}`
    );
    expect(materials[0]!.slot).not.toBe(materials[1]!.slot);
  });

  test('still gives an unnamed material somewhere to live', () => {
    const { materials } = readLessonMaterials(
      fenced('kind: exit-ticket\n---\nWrite one sentence.')
    );
    expect(materials[0]!.slot).toBe('exit-ticket:exit-ticket');
  });
});

describe('deckAsMaterial', () => {
  const reply = `Here it is.\n\n\`\`\`yawp-slides\n${JSON.stringify({
    title: 'Evidence that earns its place',
    slides: [{ layout: 'statement', title: 'A', body: 'B', speakerNotes: 'C' }],
  })}\n\`\`\``;

  test('files a deck the same way as any other artifact', () => {
    const material = deckAsMaterial(reply)!;
    expect(material.kind).toBe('slides');
    expect(material.title).toBe('Evidence that earns its place');
    // One deck per lesson: a revision replaces it rather than adding a second.
    expect(material.slot).toBe('deck');
    expect(material.audience).toBe('teacher');
  });

  test('keeps the deck block itself, so the packet can still present it', () => {
    expect(deckAsMaterial(reply)!.content).toContain('yawp-slides');
  });

  test('is nothing when the reply has no deck', () => {
    expect(deckAsMaterial('Just a plan.')).toBeNull();
  });

  test('is nothing when the deck did not build', () => {
    expect(
      deckAsMaterial('```yawp-slides\n{"slides":[{"layout":"bullets"}]}\n```')
    ).toBeNull();
  });
});
