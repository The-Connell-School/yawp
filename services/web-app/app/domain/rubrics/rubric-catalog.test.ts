import { describe, expect, test } from 'bun:test';
import fixture from './__fixtures__/prod-rubric-catalog.json';
import { canonicalJson, contentFingerprint, parseCatalogKey, perTypeContent, toEditable, validateEditable } from './rubric-catalog.server';

const STARTERS = new Set(['class-starter-engagement', 'daily-pages-short-form']);

describe('rubric catalog with production rubric content', () => {
  test('every editable production library rubric opens in the editor and passes the save validator unchanged', () => {
    expect(fixture.libraryRubrics.length).toBe(10);
    for (const rubric of fixture.libraryRubrics) {
      const { editable, preservedTopLevelKeys } = toEditable(rubric.schemaJson as any, rubric.name);
      expect(preservedTopLevelKeys).toEqual([]);
      const result = validateEditable(editable, rubric.name);
      if (!result.ok) throw new Error(`${rubric.name}: ${JSON.stringify(result.issues)}`);
      // Nothing an operator did not touch is lost when the document round-trips.
      expect((editable.rubric as any).categories).toEqual((rubric.schemaJson as any).rubric.categories);
      if (!STARTERS.has(rubric.name)) expect(editable.title).toBe((rubric.schemaJson as any).title);
    }
  });

  test('per-type rubrics mirror the database trigger shape and keep prompt keys the editor does not own', () => {
    for (const type of fixture.perTypeRubrics) {
      const content = perTypeContent(type as any);
      expect(Object.keys(content).sort()).toEqual(['calibrationNotes', 'name', 'outputSchema', 'promptConfig', 'rubric', 'scoringScale', 'title']);
      expect(content.name).toBe(`assignment-type:${type.id}`);
      const { editable } = toEditable({ ...content, promptConfig: { ...(content.promptConfig as object), gradingInstructionsOverride: 'keep me' } }, content.name as string);
      expect((editable.promptConfig as any)?.gradingInstructionsOverride).toBeUndefined();
      expect(toEditable({ ...content, promptConfig: { gradingInstructionsOverride: 'x' } }, 'n').preservedPromptConfigKeys).toEqual(['gradingInstructionsOverride']);
    }
    const daily = fixture.perTypeRubrics.find((type) => type.title === 'Daily Pages')!;
    expect(validateEditable(toEditable(perTypeContent(daily as any), 'x').editable, 'assignment-type-rubric').ok).toBe(true);
  });

  test('Strode rubric with blank band descriptions is editable (prod content must not be locked out)', () => {
    const strode = fixture.libraryRubrics.find((rubric) => rubric.name === 'strode-eng101-essay-1-description')!;
    expect(validateEditable(toEditable(strode.schemaJson as any, strode.name).editable, strode.name).ok).toBe(true);
  });

  test('the validator still rejects broken edits with a field path', () => {
    const rubric = fixture.libraryRubrics.find((r) => r.name === 'gba300-nonverbal-rubric-STUDENT')!;
    const { editable } = toEditable(rubric.schemaJson as any, rubric.name);
    const categories = (editable.rubric as any).categories;
    const blank = validateEditable({ ...editable, rubric: { categories: [{ ...categories[0], label: '' }] } }, rubric.name);
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.issues.some((issue) => issue.path === '/rubric/categories/0/label')).toBe(true);
    const duplicate = validateEditable({ ...editable, rubric: { categories: [categories[0], categories[0]] } }, rubric.name);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.issues.some((issue) => issue.path === '/rubric/categories/1/key')).toBe(true);
    expect(validateEditable({ ...editable, rubric: { categories: [] } }, rubric.name).ok).toBe(false);
  });

  test('keys, fingerprints and canonical JSON are stable', () => {
    expect(parseCatalogKey('daily-pages-engagement')).toEqual({ source: 'library', name: 'daily-pages-engagement' });
    expect(parseCatalogKey('assignment-type:cmlgtyo8j01em0qjs6knw7cni')).toEqual({ source: 'assignment-type', assignmentTypeId: 'cmlgtyo8j01em0qjs6knw7cni' });
    for (const bad of ['', 'a b', '../x', 'assignment-type:', 'assignment-type:a/b', 'x'.repeat(200), 12]) expect(parseCatalogKey(bad)).toBeNull();
    expect(canonicalJson({ b: 1, a: [1, { d: null, c: 'x' }] })).toBe('{"a":[1,{"c":"x","d":null}],"b":1}');
    expect(contentFingerprint({ a: 1, b: 2 })).toBe(contentFingerprint({ b: 2, a: 1 }));
    expect(contentFingerprint({ a: 1 })).toMatch(/^[a-f0-9]{64}$/);
  });
});