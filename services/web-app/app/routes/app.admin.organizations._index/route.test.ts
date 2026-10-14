import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import {
  ORGANIZATIONS_READ_MOVED_MESSAGE,
  OrganizationsLegacyNotice,
} from './legacy-notice';

function textContent(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (typeof node === 'object' && 'props' in node) {
    return textContent((node as { props?: { children?: unknown } }).props?.children);
  }
  return '';
}

describe('legacy admin organizations route', () => {
  test('displays moved read state and the gated legacy write controls', () => {
    const content = textContent(
      OrganizationsLegacyNotice({
        previewSeatMode: true,
        createPreviewSeatControl: createElement(
          'button',
          null,
          'Create Preview Seat'
        ),
        createOrganizationControl: createElement(
          'button',
          null,
          'Create Organization'
        ),
      })
    );

    expect(content).toContain(ORGANIZATIONS_READ_MOVED_MESSAGE);
    expect(content).toContain('Use Yawp Internal');
    expect(content).toContain('Remaining platform-only writes');
    expect(content).toContain('Create Preview Seat');
    expect(content).toContain('Create Organization');
    expect(content).not.toContain('Total Organizations');
    expect(content).not.toContain('Organization Growth');
  });
});
