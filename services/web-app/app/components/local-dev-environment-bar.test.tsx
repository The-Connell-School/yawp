import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BlackboardLtiMockLink,
  PreviewSeatIdentity,
  readDevLoginParam,
} from './local-dev-environment-bar';

describe('preview seat identity', () => {
  test('shows the bound seat beside the access-code switch control', () => {
    const html = renderToStaticMarkup(
      <PreviewSeatIdentity label="Bryant Brock" />,
    );

    expect(html).toContain('Current seat:');
    expect(html).toContain('Bryant Brock');
  });
});

describe('blackboard LTI mock entry', () => {
  test('links the flask menu to the Blackboard mock', () => {
    const html = renderToStaticMarkup(<BlackboardLtiMockLink />);

    expect(html).toContain('/dev/blackboard-lti-mock/');
    expect(html).toContain('Blackboard');
  });
});

describe('one-click dev login', () => {
  test('reads the email to sign in as from the link', () => {
    expect(
      readDevLoginParam('?devLogin=dev.teacher.free%40yawp.local')
    ).toEqual({ email: 'dev.teacher.free@yawp.local', search: '' });
    expect(
      readDevLoginParam('?tab=students&devLogin=+Dev.Teacher@Yawp.Local+')
    ).toEqual({ email: 'dev.teacher@yawp.local', search: '?tab=students' });
  });

  test('ignores links without a usable email', () => {
    expect(readDevLoginParam('')).toBeNull();
    expect(readDevLoginParam('?tab=students')).toBeNull();
    expect(readDevLoginParam('?devLogin=')).toBeNull();
    expect(readDevLoginParam('?devLogin=not-an-email')).toBeNull();
  });
});
