import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'bun:test';
import PrivacyRoute from './route';

function visibleText(html: string) {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

test('privacy policy states student data commitments above automated feedback', () => {
  const html = visibleText(renderToStaticMarkup(<PrivacyRoute />));
  const commitments = html.indexOf('Our Commitments on Student Data');
  const automated = html.indexOf('>Automated Feedback<');
  expect(commitments).toBeGreaterThan(-1);
  expect(automated).toBeGreaterThan(commitments);
  expect(html).toContain('We never sell student data.');
  expect(html).toContain(
    'We never use student data for advertising or to build advertising profiles.'
  );
  expect(html).toContain(
    "Schools own their student data. At a school's request, or when its agreement with us ends, we return the school's student data to it and then delete it within 30 days."
  );
  expect(html).toContain('Last updated November 17, 2026.');
  expect(html).not.toMatch(/Yawp(?!!)/);
});

test('privacy policy includes privacy laws and agreements from Advocate Pack alignment', () => {
  const html = renderToStaticMarkup(<PrivacyRoute />);
  expect(html).toContain('id="privacy-laws"');
  expect(html).toContain('Privacy laws and agreements');
  expect(html).toContain('SDPC National Data Privacy Agreement');
  expect(html).toContain('will sign');
  expect(html).toContain('University of Alabama addendum');
  expect(html).toContain('students under 13');
});
