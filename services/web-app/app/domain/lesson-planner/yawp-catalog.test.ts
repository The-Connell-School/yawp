import { describe, expect, test } from 'bun:test';
import {
  listWritingLessonCatalog,
  searchDailyPagesPrompts,
  summarizeLoungeMaterials,
  WRITING_LESSON_SKILL_HINTS,
} from './yawp-catalog';

describe('searchDailyPagesPrompts', () => {
  test('returns tagged prompts with an id the planner can cite', () => {
    const results = searchDailyPagesPrompts({});
    expect(results.length).toBeGreaterThan(0);
    const first = results[0]!;
    expect(first.id).toBeTruthy();
    expect(first.prompt).toBeTruthy();
    expect(Array.isArray(first.themes)).toBe(true);
  });

  test('filters by the text or unit a class is reading', () => {
    const results = searchDailyPagesPrompts({ text: 'macbeth' });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(
        result.textsOrUnits.some((unit) =>
          unit.toLowerCase().includes('macbeth')
        )
      ).toBe(true);
    }
  });

  test('filters by grade band', () => {
    const results = searchDailyPagesPrompts({ gradeBand: '9' });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.gradeBands).toContain('9');
    }
  });

  test('filters by cognitive move and prompt type together', () => {
    const results = searchDailyPagesPrompts({
      cognitiveMove: 'take-a-stance',
      type: 'agree-disagree',
    });
    for (const result of results) {
      expect(result.cognitiveMoves).toContain('take-a-stance');
      expect(result.type).toBe('agree-disagree');
    }
  });

  test('matches free text against the prompt and its themes', () => {
    const results = searchDailyPagesPrompts({ query: 'identity' });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      const haystack = [result.prompt, ...result.themes]
        .join(' ')
        .toLowerCase();
      expect(haystack).toContain('identity');
    }
  });

  test('caps results so a tool call cannot flood the context', () => {
    expect(searchDailyPagesPrompts({}).length).toBeLessThanOrEqual(12);
    expect(searchDailyPagesPrompts({ limit: 3 })).toHaveLength(3);
    // An absurd limit is clamped, not honored.
    expect(searchDailyPagesPrompts({ limit: 500 }).length).toBeLessThanOrEqual(
      12
    );
  });

  test('returns nothing rather than guessing when a filter matches no prompt', () => {
    expect(
      searchDailyPagesPrompts({ text: 'a-novel-yawp-does-not-have' })
    ).toEqual([]);
  });
});

describe('listWritingLessonCatalog', () => {
  test('lists lessons with a slug, category, and a real teacher-facing link', () => {
    const lessons = listWritingLessonCatalog({});
    expect(lessons.length).toBeGreaterThan(0);
    for (const lesson of lessons) {
      expect(lesson.slug).toBeTruthy();
      expect(lesson.title).toBeTruthy();
      expect(lesson.href).toBe(`/app/writing-lessons/${lesson.slug}`);
    }
  });

  test('filters by category', () => {
    const lessons = listWritingLessonCatalog({ category: 'Punctuation' });
    expect(lessons.length).toBeGreaterThan(0);
    for (const lesson of lessons) {
      expect(lesson.category).toBe('Punctuation');
    }
  });

  test('maps every rubric skill hint to categories that exist', () => {
    const categories = new Set(
      listWritingLessonCatalog({}).map((lesson) => lesson.category)
    );
    for (const hinted of Object.values(WRITING_LESSON_SKILL_HINTS).flat()) {
      expect(categories.has(hinted)).toBe(true);
    }
  });

  test('narrows to the lessons that serve a rubric skill', () => {
    const lessons = listWritingLessonCatalog({
      rubricCategory: 'grammar_and_mechanics',
    });
    expect(lessons.length).toBeGreaterThan(0);
    const allowed = WRITING_LESSON_SKILL_HINTS.grammar_and_mechanics;
    for (const lesson of lessons) {
      expect(allowed).toContain(lesson.category);
    }
  });
});

describe('summarizeLoungeMaterials', () => {
  const training = {
    id: 'tr-1',
    title: 'Teaching Argument',
    description: 'A course on argument writing.',
    teacherTrainingModules: [
      {
        id: 'mod-1',
        title: 'Conclusions',
        description: 'Landing the essay.',
        position: 1,
        resources: [
          {
            id: 'res-deck',
            name: 'Conclusions — class slides.pptx',
            contentType:
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          },
          {
            id: 'res-captions',
            name: 'module-captions.vtt',
            contentType: 'text/vtt',
          },
          {
            id: 'res-transcript',
            name: 'module-transcript.txt',
            contentType: 'text/plain',
          },
        ],
      },
    ],
    resources: [
      {
        id: 'link-1',
        title: 'Further reading',
        description: 'An article.',
        url: 'https://example.test/reading',
      },
    ],
  };

  test('links each module and each downloadable resource', () => {
    const [summary] = summarizeLoungeMaterials([training]);
    expect(summary!.href).toBe('/app/teacher-trainings/tr-1');
    const module = summary!.modules[0]!;
    expect(module.href).toBe('/app/teacher-trainings/tr-1/modules/mod-1');
    expect(module.materials[0]).toMatchObject({
      name: 'Conclusions — class slides.pptx',
      href: '/api/teacher-training-module-resource/res-deck',
    });
  });

  test('drops captions and transcripts, which are not teaching material', () => {
    const [summary] = summarizeLoungeMaterials([training]);
    const names = summary!.modules[0]!.materials.map(
      (material) => material.name
    );
    expect(names).toEqual(['Conclusions — class slides.pptx']);
  });

  test('flags a slide deck so the planner can offer to project it', () => {
    const [summary] = summarizeLoungeMaterials([training]);
    expect(summary!.modules[0]!.materials[0]!.kind).toBe('slides');
  });

  test('classifies other material by its type rather than guessing', () => {
    const [summary] = summarizeLoungeMaterials([
      {
        ...training,
        teacherTrainingModules: [
          {
            ...training.teacherTrainingModules[0]!,
            resources: [
              {
                id: 'res-pdf',
                name: 'Practice handout.pdf',
                contentType: 'application/pdf',
              },
            ],
          },
        ],
      },
    ]);
    expect(summary!.modules[0]!.materials[0]!.kind).toBe('document');
  });

  test('carries training-level links through', () => {
    const [summary] = summarizeLoungeMaterials([training]);
    expect(summary!.links).toEqual([
      {
        title: 'Further reading',
        description: 'An article.',
        url: 'https://example.test/reading',
      },
    ]);
  });

  test('omits a training with nothing usable in it', () => {
    expect(
      summarizeLoungeMaterials([
        {
          ...training,
          teacherTrainingModules: [],
          resources: [],
        },
      ])
    ).toEqual([]);
  });
});
