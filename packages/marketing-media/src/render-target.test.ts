import { describe, expect, test } from 'bun:test';
import { isAllowedRenderTargetHost } from './render-target';

describe('isAllowedRenderTargetHost', () => {
  test('accepts local development, the demo box, and PR previews', () => {
    expect(isAllowedRenderTargetHost('localhost')).toBe(true);
    expect(isAllowedRenderTargetHost('127.0.0.1')).toBe(true);
    expect(isAllowedRenderTargetHost('demo.yawp.school')).toBe(true);
    expect(isAllowedRenderTargetHost('pr-322.preview.yawp.school')).toBe(true);
    expect(isAllowedRenderTargetHost('PR-322.Preview.Yawp.School')).toBe(true);
  });

  test('refuses production, whatever the variables claim', () => {
    expect(isAllowedRenderTargetHost('yawp.school')).toBe(false);
    expect(isAllowedRenderTargetHost('www.yawp.school')).toBe(false);
    expect(isAllowedRenderTargetHost('app.yawp.school')).toBe(false);
  });

  test('refuses everything else', () => {
    expect(isAllowedRenderTargetHost('example.com')).toBe(false);
    expect(isAllowedRenderTargetHost('demo.yawp.school.evil.com')).toBe(false);
    // Label boundary: a host merely ending in the preview words is not a preview.
    expect(isAllowedRenderTargetHost('evilpreview.yawp.school')).toBe(false);
    expect(isAllowedRenderTargetHost('preview.yawp.school')).toBe(false);
    expect(isAllowedRenderTargetHost('')).toBe(false);
  });
});
