import { expect, test } from 'bun:test';
import {
  RELEASE_EMAIL_V2_COPY_VERSION,
  renderReleaseEmailBody,
  renderReleaseEmailSubject,
} from './email-copy';
import { plainTextEmailToHtml } from './email-html.server';

const application = { name: 'Ada <Teacher>', joinUrl: 'https://example.test/free/join?t=local-only' };

test('explicit v2 email copy renders the admission heading and subject without delivery', () => {
  const args = { ...application, copyVersion: RELEASE_EMAIL_V2_COPY_VERSION };
  const text = renderReleaseEmailBody(args);
  expect(renderReleaseEmailSubject(args)).toBe("You're in!");
  expect(text).toContain("\n\nYou're in!\n\n");
  expect(text).toContain(application.joinUrl);
  expect(text).toContain('expires in 30 days');
  const html = plainTextEmailToHtml(text);
  expect(html).toContain("You&#39;re in!");
  expect(html).toContain('Ada &lt;Teacher&gt;');
  expect(html).not.toContain('<Teacher>');
});

test('legacy and unknown copy versions retain legacy admission wording', () => {
  for (const copyVersion of [undefined, '2026-10-14-v5', 'unknown']) {
    const args = { ...application, copyVersion };
    expect(renderReleaseEmailSubject(args)).toBe("You're in — start your Yawp! classroom");
    expect(renderReleaseEmailBody(args)).toContain("You're in — we'd love to have you try Yawp! with your students.");
  }
});
