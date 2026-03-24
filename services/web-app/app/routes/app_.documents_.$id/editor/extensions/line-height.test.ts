import { describe, expect, test } from 'bun:test';
import {
  normalizeLineHeightForRender,
  normalizeLineHeightFromHtml,
} from './line-height';

describe('line-height normalization', () => {
  test('keeps canonical values stable across parse/render round trips', () => {
    const canonical = '2';
    const rendered = normalizeLineHeightForRender(canonical);
    const parsed = normalizeLineHeightFromHtml({
      dataLineHeight: rendered,
      styleLineHeight: rendered,
    });
    const reparsed = normalizeLineHeightFromHtml({
      dataLineHeight: rendered,
      styleLineHeight: rendered,
    });
    const rerendered = normalizeLineHeightForRender(reparsed);

    expect(parsed).toBe('2');
    expect(rendered).toBe('2');
    expect(reparsed).toBe('2');
    expect(rerendered).toBe('2');
  });

  test('normalizes legacy inflated saved values back to intended spacing', () => {
    expect(normalizeLineHeightFromHtml({ styleLineHeight: '2.6' })).toBe('2');
    expect(normalizeLineHeightFromHtml({ styleLineHeight: '2' })).toBe('1.5');
    expect(normalizeLineHeightFromHtml({ styleLineHeight: '1.58' })).toBe(
      '1.15'
    );
    expect(normalizeLineHeightFromHtml({ styleLineHeight: '1.4' })).toBe('1');
  });
});
