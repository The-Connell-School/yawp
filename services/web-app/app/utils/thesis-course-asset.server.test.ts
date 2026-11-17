import { describe, expect, test } from 'bun:test';
import path from 'node:path';
import {
  resolveThesisCourseAssetAbsolutePath,
  thesisCourseAssetMimeType,
} from './thesis-course-asset.server';

const webAppRoot = process.cwd();

describe('thesis course asset resolution', () => {
  test('resolves an existing deck under public/courses', () => {
    const resolved = resolveThesisCourseAssetAbsolutePath('02-pre-writing.pptx');
    expect(resolved).toBe(
      path.join(webAppRoot, 'public/courses/thesis-driven-essay/02-pre-writing.pptx')
    );
    expect(thesisCourseAssetMimeType(resolved!)).toContain('presentationml');
  });

  test('rejects path traversal', () => {
    expect(resolveThesisCourseAssetAbsolutePath('../package.json')).toBeNull();
    expect(resolveThesisCourseAssetAbsolutePath('tutorials/../../package.json')).toBeNull();
  });

  test('returns null for missing files', () => {
    expect(resolveThesisCourseAssetAbsolutePath('does-not-exist.pptx')).toBeNull();
  });
});