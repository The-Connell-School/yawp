import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BlackboardLtiMockLink,
  PreviewSeatIdentity,
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
