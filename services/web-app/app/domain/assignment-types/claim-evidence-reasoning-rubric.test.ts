import { expect, test } from 'bun:test';
import {
  C_E_R_LIBRARY_RUBRIC_NAME,
  CLAIM_EVIDENCE_REASONING_ASSIGNMENT_TYPE_KIND,
  CLAIM_EVIDENCE_REASONING_RUBRIC,
} from './claim-evidence-reasoning-assignment-type';
import cErLibrarySchema from '~/domain/rubrics/library/c-e-r.json';

test('C-E-R kind and library slug match production wiring', () => {
  expect(CLAIM_EVIDENCE_REASONING_ASSIGNMENT_TYPE_KIND).toBe(
    'claim_evidence_reasoning'
  );
  expect(C_E_R_LIBRARY_RUBRIC_NAME).toBe('c-e-r');
  expect(cErLibrarySchema.name).toBe('c-e-r');
  expect(cErLibrarySchema.title).toBe('C-E-R');
});

test('library schema and kind defaults agree on category keys', () => {
  const keys = CLAIM_EVIDENCE_REASONING_RUBRIC.categories.map((c) => c.key);
  expect(keys).toEqual(['claim', 'evidence', 'reasoning']);
  expect(cErLibrarySchema.rubric.categories.map((c) => c.key)).toEqual(keys);
});