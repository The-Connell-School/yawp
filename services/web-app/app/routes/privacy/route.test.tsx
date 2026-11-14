import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'bun:test';
import PrivacyRoute from './route';

test('privacy policy includes privacy laws and agreements from Advocate Pack alignment', () => {
  const html = renderToStaticMarkup(<PrivacyRoute />);
  expect(html).toContain('id="privacy-laws"');
  expect(html).toContain('Privacy laws and agreements');
  expect(html).toContain('SDPC National Data Privacy Agreement');
  expect(html).toContain('will sign');
  expect(html).toContain('University of Alabama addendum');
  expect(html).toContain('students under 13');
});
