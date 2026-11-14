import { afterEach, describe, expect, mock, test } from 'bun:test';
import { DOCUMENT_EDITOR_V2_FLAG } from './document-editor-v2-flag';

const isFeatureFlagEnabled = mock(async () => false);

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled,
}));

const { resolveDocumentEditorV2Enabled, isDocumentEditorV2RolloutEnabled } =
  await import('./document-editor-v2-gate.server');

describe('document editor v2 gate', () => {
  afterEach(() => {
    isFeatureFlagEnabled.mockReset();
    delete process.env.YAWP_ENVIRONMENT;
    delete process.env.PREVIEW_SLUG;
  });

  test('rollout is off when the flag row is missing on production', async () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    isFeatureFlagEnabled.mockResolvedValue(false);
    expect(await isDocumentEditorV2RolloutEnabled()).toBe(false);
    expect(isFeatureFlagEnabled).toHaveBeenCalledWith(
      DOCUMENT_EDITOR_V2_FLAG,
      null
    );
  });

  test('demo deployments enable rollout without a database row', async () => {
    process.env.YAWP_ENVIRONMENT = 'demo';
    isFeatureFlagEnabled.mockResolvedValue(true);
    expect(await isDocumentEditorV2RolloutEnabled()).toBe(true);
  });

  test('preview deployments enable rollout without a database row', async () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    isFeatureFlagEnabled.mockResolvedValue(true);
    expect(await isDocumentEditorV2RolloutEnabled()).toBe(true);
  });

  test('staff override uses ?editor=v2 on production when not globally on', async () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    isFeatureFlagEnabled.mockResolvedValue(false);
    const request = new Request(
      'https://yawp.school/app/documents/doc-1?editor=v2'
    );
    expect(
      await resolveDocumentEditorV2Enabled({ request, isStaff: true })
    ).toBe(true);
  });

  test('students never get v2 on production without the flag', async () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    isFeatureFlagEnabled.mockResolvedValue(false);
    const request = new Request(
      'https://yawp.school/app/documents/doc-1?editor=v2'
    );
    expect(
      await resolveDocumentEditorV2Enabled({ request, isStaff: false })
    ).toBe(false);
  });

  test('staff ?editor=v1 opts out even when rollout is on', async () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    isFeatureFlagEnabled.mockResolvedValue(true);
    const request = new Request(
      'https://yawp.school/app/documents/doc-1?editor=v1'
    );
    expect(
      await resolveDocumentEditorV2Enabled({ request, isStaff: true })
    ).toBe(false);
  });

  test('students cannot use ?editor=v1 to opt out of v2', async () => {
    process.env.YAWP_ENVIRONMENT = 'preview';
    isFeatureFlagEnabled.mockResolvedValue(true);
    const request = new Request(
      'https://yawp.school/app/documents/doc-1?editor=v1'
    );
    expect(
      await resolveDocumentEditorV2Enabled({ request, isStaff: false })
    ).toBe(true);
  });
});