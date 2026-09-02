import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BlackboardLtiMockLink,
  LocalDevEnvironmentBar,
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

describe('capture chrome marker', () => {
  // The marketing renderer hides everything marked data-environment-bar
  // before it films, so the flask badge that tells a human "this is a preview"
  // never ends up in a still or clip meant for an audience. Both shapes of the
  // badge — tooltip-only and the dev-login menu — carry the marker.
  test('marks the floating badge in both of its forms', () => {
    const tooltipOnly = renderToStaticMarkup(
      <LocalDevEnvironmentBar bannerWarning="preview" />,
    );
    expect(tooltipOnly).toContain('data-environment-bar');

    const withMenu = renderToStaticMarkup(
      <LocalDevEnvironmentBar
        bannerWarning="localhost"
        localDevQuickLogin={{ enabled: true, options: [] } as never}
      />,
    );
    expect(withMenu).toContain('data-environment-bar');
  });
});
