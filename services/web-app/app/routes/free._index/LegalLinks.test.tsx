import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { FreeTierLegalLinks } from './LegalLinks';

describe('FreeTierLegalLinks', () => {
  test('renders public privacy and terms links for the signup surface', () => {
    const html = renderToStaticMarkup(<FreeTierLegalLinks />);

    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('Terms');
    expect(html).toContain('Privacy Policy');
  });
});
