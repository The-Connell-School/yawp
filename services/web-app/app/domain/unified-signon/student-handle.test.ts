import { expect, test } from 'bun:test';
import { studentHandleBase, handleCandidate, HANDLE_ATTEMPTS } from './student-handle';

test('handles preserve name casing, fold accents and remove supported separators', () => {
  expect(studentHandleBase(' Brian ', 'Connell')).toBe('BrianConnell');
  expect(studentHandleBase('Éloïse', "O’Neill-Smith")).toBe('EloiseONeillSmith');
  expect(studentHandleBase('李', '明')).toBe('李明');
});
test('names reject empty, digits, symbols, unsupported punctuation and overlong inputs', () => {
  for (const name of ['', ' ', '123', '😀', 'A<script>', 'A'.repeat(81)])
    expect(() => studentHandleBase(name, 'Connell')).toThrow();
});
test('handles have bounded length and numeric collision suffixes with a finite retry budget', () => {
  expect(handleCandidate('BrianConnell', 0)).toBe('BrianConnell');
  expect(handleCandidate('BrianConnell', 1)).toBe('BrianConnell1');
  expect(handleCandidate('A'.repeat(80), 99)).toHaveLength(30);
  expect(HANDLE_ATTEMPTS).toBe(100);
});
