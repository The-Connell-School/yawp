import { describe, expect, test } from 'bun:test';
import { buttonClassNames } from './button';

describe('buttonClassNames', () => {
  test('a button stays on one line unless asked to wrap', () => {
    expect(buttonClassNames({ size: 'sm' })).toBe('btn btn--primary btn--sm');
  });

  test('wrap lets a long label run onto more lines instead of past its box', () => {
    expect(buttonClassNames({ size: 'sm', variant: 'outline-primary', wrap: true })).toBe(
      'btn btn--outline-primary btn--sm btn--wrap'
    );
  });
});
