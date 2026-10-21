import { describe, expect, it } from 'bun:test';

import {
  lessonMaterialsFor,
  lessonModulePhraseForKind,
} from './lesson-materials';

const PREWRITING_RESOURCES = [
  {
    id: 'plan',
    name: 'Yawp!_ Prewriting Lesson Plan.pdf',
    contentType: 'application/pdf',
  },
  {
    id: 'deck',
    name: 'Pre-Writing Slide Deck.pptx',
    contentType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  {
    id: 'prompts',
    name: 'Sample Thesis-Driven Essay Prompts.docx',
    contentType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  {
    id: 'captions',
    name: '08-lesson-2-pre-writing-captions.vtt',
    contentType: 'text/vtt',
  },
  {
    id: 'transcript',
    name: '08-lesson-2-pre-writing-transcript.md',
    contentType: 'text/markdown',
  },
];

describe('lessonModulePhraseForKind', () => {
  it('maps the free-tier standalone steps to their course lessons', () => {
    expect(lessonModulePhraseForKind('prewriting')).toBe('Pre-writing');
    expect(lessonModulePhraseForKind('thesis_statement')).toBe(
      'Developing a Thesis Statement'
    );
  });

  it('has no lesson for other kinds', () => {
    expect(lessonModulePhraseForKind('class_starter')).toBeNull();
    expect(lessonModulePhraseForKind(null)).toBeNull();
  });
});

describe('lessonMaterialsFor', () => {
  it('lists the lesson plan, slide deck, and video first, then handouts', () => {
    const materials = lessonMaterialsFor({
      trainingId: 'training-1',
      moduleId: 'module-2',
      hasVideo: true,
      resources: PREWRITING_RESOURCES,
    });

    expect(materials).toEqual([
      {
        kind: 'lesson-plan',
        label: 'Lesson plan',
        href: '/api/teacher-training-module-resource/plan',
      },
      {
        kind: 'slide-deck',
        label: 'Slide deck',
        href: '/api/teacher-training-module-resource/deck',
      },
      {
        kind: 'video',
        label: 'Tutorial video',
        href: '/app/teacher-trainings/training-1/modules/module-2',
      },
      {
        kind: 'handout',
        label: 'Sample Thesis-Driven Essay Prompts',
        href: '/api/teacher-training-module-resource/prompts',
      },
    ]);
  });

  it('leaves out the video when the lesson has none', () => {
    const materials = lessonMaterialsFor({
      trainingId: 'training-1',
      moduleId: 'module-2',
      hasVideo: false,
      resources: PREWRITING_RESOURCES.slice(0, 2),
    });

    expect(materials.map((material) => material.kind)).toEqual([
      'lesson-plan',
      'slide-deck',
    ]);
  });

  it('never offers caption or transcript files as teaching material', () => {
    const materials = lessonMaterialsFor({
      trainingId: 'training-1',
      moduleId: 'module-2',
      hasVideo: false,
      resources: PREWRITING_RESOURCES.slice(3),
    });

    expect(materials).toEqual([]);
  });
});
