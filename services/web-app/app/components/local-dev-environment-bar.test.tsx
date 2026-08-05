import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PreviewSeatIdentity } from './local-dev-environment-bar';

describe('preview seat identity', () => {
  test('shows the bound seat beside the access-code switch control', () => {
    const html = renderToStaticMarkup(
      <PreviewSeatIdentity label="Bryant Brock" />
    );

    expect(html).toContain('Current seat:');
    expect(html).toContain('Bryant Brock');
  });
});
