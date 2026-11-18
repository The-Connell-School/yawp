import { expect, test } from 'bun:test';
import {
  FREE_CLASSROOM_ASSIGNMENT_KINDS,
  FREE_CLASSROOM_ASSIGNMENT_QUOTAS,
  FREE_CLASSROOM_BUNDLE_KIND_ORDER,
} from './free-classroom-assignment-kinds';

test('free classroom bundle lists six kinds in Brian’s order', () => {
  expect(FREE_CLASSROOM_BUNDLE_KIND_ORDER).toEqual([
    'class_starter',
    'exit_ticket',
    'five_paragraph_essay',
    'prewriting',
    'thesis_statement',
    'claim_evidence_reasoning',
  ]);
  expect(FREE_CLASSROOM_ASSIGNMENT_KINDS).toEqual([
    ...FREE_CLASSROOM_BUNDLE_KIND_ORDER,
  ]);
  expect(Object.keys(FREE_CLASSROOM_ASSIGNMENT_QUOTAS)).toEqual([
    ...FREE_CLASSROOM_BUNDLE_KIND_ORDER,
  ]);
});

test('exit ticket and writing-step kinds share the same free-tier quotas', () => {
  expect(FREE_CLASSROOM_ASSIGNMENT_QUOTAS.exit_ticket).toBe(3);
  expect(FREE_CLASSROOM_ASSIGNMENT_QUOTAS.five_paragraph_essay).toBe(3);
  expect(FREE_CLASSROOM_ASSIGNMENT_QUOTAS.prewriting).toBe(3);
  expect(FREE_CLASSROOM_ASSIGNMENT_QUOTAS.thesis_statement).toBe(3);
  expect(FREE_CLASSROOM_ASSIGNMENT_QUOTAS.claim_evidence_reasoning).toBe(3);
});
