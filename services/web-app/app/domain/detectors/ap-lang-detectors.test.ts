import { describe, expect, test } from 'bun:test';
import { apLangDetectors } from './ap-lang-detectors';
import { runDetectors } from './detector-framework';

describe('AP Lang detectors', () => {
  test('thesis-restates-prompt fires on a short intro with no reasoning language', () => {
    const essay =
      'I agree with the idea that technology is good for society.\n\nTechnology helps people communicate.';
    const results = runDetectors(apLangDetectors, essay, 'synthesis');
    expect(results.some((r) => r.detectorId === 'thesis-restates-prompt')).toBe(
      true
    );
  });

  test('thesis-restates-prompt does not fire when intro has reasoning language', () => {
    const essay =
      'Although technology disrupts traditional labor markets, its net effect is positive because it creates new industries, increases productivity, and democratizes access to information.\n\nBody paragraph here.';
    const results = runDetectors(apLangDetectors, essay, 'synthesis');
    expect(results.some((r) => r.detectorId === 'thesis-restates-prompt')).toBe(
      false
    );
  });

  test('walking-through-sources fires when paragraphs each mention one source', () => {
    const essay = [
      'Thesis paragraph.',
      'Source A states that technology is beneficial.',
      'Source B argues that technology is harmful.',
      'Source C explains that technology is changing society.',
      'In conclusion, technology is complex.',
    ].join('\n\n');
    const results = runDetectors(apLangDetectors, essay, 'synthesis');
    expect(
      results.some((r) => r.detectorId === 'walking-through-sources')
    ).toBe(true);
  });

  test('walking-through-sources does not fire for non-synthesis essays', () => {
    const essay = [
      'Thesis paragraph.',
      'Source A states that technology is beneficial.',
      'Source B argues that technology is harmful.',
      'Source C explains that technology is changing society.',
      'In conclusion.',
    ].join('\n\n');
    const results = runDetectors(apLangDetectors, essay, 'argument');
    expect(
      results.some((r) => r.detectorId === 'walking-through-sources')
    ).toBe(false);
  });

  test('vague-evidence fires on argument essays with vague phrases', () => {
    const essay =
      'Many people believe that education is important. Studies show that reading improves the mind. In today\'s society, education matters more than ever.\n\nTherefore we should invest in schools.';
    const results = runDetectors(apLangDetectors, essay, 'argument');
    expect(results.some((r) => r.detectorId === 'vague-evidence')).toBe(true);
  });

  test('vague-evidence does not fire for non-argument essays', () => {
    const essay =
      'Many people believe that education is important. Studies show that reading improves the mind.\n\nEnd.';
    const results = runDetectors(apLangDetectors, essay, 'synthesis');
    expect(results.some((r) => r.detectorId === 'vague-evidence')).toBe(false);
  });

  test('missing-counterargument fires on argument essay with no opposing view', () => {
    const essay =
      'Education is the most important thing. It helps people get jobs. It teaches critical thinking. Therefore, we should invest in education.';
    const results = runDetectors(apLangDetectors, essay, 'argument');
    expect(
      results.some((r) => r.detectorId === 'missing-counterargument')
    ).toBe(true);
  });

  test('missing-counterargument does not fire when counterargument present', () => {
    const essay =
      'Education is important. However, some may argue that practical experience is more valuable. While this has merit, formal education provides a foundation.\n\nConclusion.';
    const results = runDetectors(apLangDetectors, essay, 'argument');
    expect(
      results.some((r) => r.detectorId === 'missing-counterargument')
    ).toBe(false);
  });

  test('device-without-effect fires on rhetorical analysis without effect language', () => {
    const essay =
      'The author uses metaphor in this speech. The author also uses imagery. The author uses repetition throughout.\n\nConclusion.';
    const results = runDetectors(
      apLangDetectors,
      essay,
      'rhetorical-analysis'
    );
    expect(results.some((r) => r.detectorId === 'device-without-effect')).toBe(
      true
    );
  });

  test('device-without-effect does not fire when effects are explained', () => {
    const essay =
      'The author uses metaphor to convey the urgency of the situation. This creates a sense of immediacy that compels the reader to act.\n\nConclusion.';
    const results = runDetectors(
      apLangDetectors,
      essay,
      'rhetorical-analysis'
    );
    expect(results.some((r) => r.detectorId === 'device-without-effect')).toBe(
      false
    );
  });

  test('no detectors fire on a clean essay', () => {
    const essay = [
      'Although automation threatens traditional jobs, its deeper effect is to redefine human skills because it creates new industries, democratizes access to knowledge, and forces educational systems to adapt.',
      'Source A and Source C both argue that automation increases productivity. However, Source B complicates this by showing that displaced workers face long adjustment periods. This tension reveals that the benefits of automation are unevenly distributed — which suggests that policy, not technology itself, determines outcomes.',
      'Source D provides quantitative evidence: regions with retraining programs saw 40% faster reemployment. This demonstrates that the problem is not automation but the absence of institutional support. Source E reinforces this by showing that countries with robust safety nets experienced less social disruption.',
      'Admittedly, Source F raises a genuine concern about algorithmic bias in hiring. While this complicates the optimistic narrative, it strengthens the case for proactive regulation rather than technological rejection.',
      'The evidence therefore suggests that automation, guided by thoughtful policy, creates more opportunity than it destroys — but only when institutions adapt as quickly as the technology itself.',
    ].join('\n\n');
    const results = runDetectors(apLangDetectors, essay, 'synthesis');
    expect(results).toHaveLength(0);
  });
});
