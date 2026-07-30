import { describe, it, expect } from 'bun:test';
import {
  buildTutorGuidelineLayers,
  renderTutorGuidelineLayers,
  TUTOR_GUIDELINE_LAYER_META,
  UNIVERSAL_YAWP_TUTOR_GUIDELINES,
} from './tutor-guidelines';

describe('UNIVERSAL_YAWP_TUTOR_GUIDELINES', () => {
  it('carries the YAWP coaching philosophy, not system mechanics', () => {
    expect(UNIVERSAL_YAWP_TUTOR_GUIDELINES.length).toBeGreaterThan(200);
    expect(UNIVERSAL_YAWP_TUTOR_GUIDELINES.toLowerCase()).toContain(
      'never ghostwrite'
    );
    expect(UNIVERSAL_YAWP_TUTOR_GUIDELINES).not.toContain(
      'student_document_context'
    );
  });

  it('is trimmed so prompt assembly never introduces stray whitespace', () => {
    expect(UNIVERSAL_YAWP_TUTOR_GUIDELINES).toBe(
      UNIVERSAL_YAWP_TUTOR_GUIDELINES.trim()
    );
  });
});

describe('buildTutorGuidelineLayers', () => {
  it('always reports the universal layer as active, even with nothing configured', () => {
    const layers = buildTutorGuidelineLayers({});
    const universal = layers.find((layer) => layer.key === 'universal');

    expect(universal?.isActive).toBe(true);
    expect(universal?.body).toBe(UNIVERSAL_YAWP_TUTOR_GUIDELINES);
    expect(universal?.label).toBe(TUTOR_GUIDELINE_LAYER_META.universal.label);
  });

  it('returns the layers in prompt order: universal, course, module, step', () => {
    const layers = buildTutorGuidelineLayers({
      course: 'Course rules.',
      module: 'Module rules.',
      step: 'Step rules.',
    });

    expect(layers.map((layer) => layer.key)).toEqual([
      'universal',
      'course',
      'module',
      'step',
    ]);
    expect(layers.every((layer) => layer.isActive)).toBe(true);
  });

  it('marks blank, whitespace-only, and missing layers as inactive', () => {
    const layers = buildTutorGuidelineLayers({
      course: '   ',
      module: '',
      step: null,
    });

    expect(
      layers.filter((layer) => layer.isActive).map((layer) => layer.key)
    ).toEqual(['universal']);
  });

  it('trims configured bodies', () => {
    const layers = buildTutorGuidelineLayers({
      course: '  Coach AP Lit prose analysis.\n',
    });
    const course = layers.find((layer) => layer.key === 'course');

    expect(course?.body).toBe('Coach AP Lit prose analysis.');
  });
});

describe('renderTutorGuidelineLayers', () => {
  it('labels every active layer so the prompt shows which guidance is which', () => {
    const rendered = renderTutorGuidelineLayers(
      buildTutorGuidelineLayers({
        course: 'Course rules.',
        module: 'Module rules.',
        step: 'Step rules.',
      })
    );

    expect(rendered).toContain(TUTOR_GUIDELINE_LAYER_META.universal.label);
    expect(rendered).toContain(TUTOR_GUIDELINE_LAYER_META.course.label);
    expect(rendered).toContain(TUTOR_GUIDELINE_LAYER_META.module.label);
    expect(rendered).toContain(TUTOR_GUIDELINE_LAYER_META.step.label);
    expect(rendered).toContain('Course rules.');
    expect(rendered).toContain('Module rules.');
    expect(rendered).toContain('Step rules.');
  });

  it('states that later layers add to the universal guidelines', () => {
    const rendered = renderTutorGuidelineLayers(buildTutorGuidelineLayers({}));
    expect(rendered.toLowerCase()).toContain('never override');
  });

  it('omits inactive layers entirely', () => {
    const rendered = renderTutorGuidelineLayers(
      buildTutorGuidelineLayers({ module: 'Module rules.' })
    );

    expect(rendered).toContain(TUTOR_GUIDELINE_LAYER_META.module.label);
    expect(rendered).not.toContain(TUTOR_GUIDELINE_LAYER_META.course.label);
    expect(rendered).not.toContain(TUTOR_GUIDELINE_LAYER_META.step.label);
  });
});
