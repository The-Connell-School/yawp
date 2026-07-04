import { describe, expect, test } from 'bun:test';
import { loadPgModuleForBaseline } from './baseline-runner';

describe('AI context eval baseline runner dependencies', () => {
  test('loads pg through an installed workspace dependency', () => {
    const pg = loadPgModuleForBaseline();

    expect(typeof pg.Client).toBe('function');
  });
});
