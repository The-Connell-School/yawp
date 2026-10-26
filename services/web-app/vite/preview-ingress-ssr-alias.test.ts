import { describe, expect, test } from 'bun:test';
import {
  createPreviewIngressReactRouterSsrAliasPlugin,
  shouldApplyPreviewIngressReactRouterSsrAlias,
} from './preview-ingress-ssr-alias';

describe('preview ingress SSR react-router alias', () => {
  test('applies only when YAWP_ENVIRONMENT is preview', () => {
    expect(
      shouldApplyPreviewIngressReactRouterSsrAlias({
        YAWP_ENVIRONMENT: 'preview',
      })
    ).toBe(true);
    expect(
      shouldApplyPreviewIngressReactRouterSsrAlias({
        YAWP_ENVIRONMENT: 'production',
      })
    ).toBe(false);
    expect(
      shouldApplyPreviewIngressReactRouterSsrAlias({
        YAWP_ENVIRONMENT: 'demo',
      })
    ).toBe(false);
  });

  test('does not alias react-router for production SSR builds', () => {
    const plugin = createPreviewIngressReactRouterSsrAliasPlugin({
      reactRouterOriginal: '/virtual/react-router-original',
      reactRouterWithPreviewIngress: '/virtual/react-router-with-preview-ingress',
      env: { YAWP_ENVIRONMENT: 'production' },
    });
    const resolveId = plugin.resolveId;
    if (typeof resolveId !== 'function') {
      throw new Error('expected preview ingress alias plugin to define resolveId');
    }
    expect(
      resolveId.call(
        {} as never,
        'react-router',
        undefined,
        { ssr: true } as never
      )
    ).toBeNull();
  });

  test('aliases react-router for preview SSR builds', () => {
    const plugin = createPreviewIngressReactRouterSsrAliasPlugin({
      reactRouterOriginal: '/virtual/react-router-original',
      reactRouterWithPreviewIngress: '/virtual/react-router-with-preview-ingress',
      env: { YAWP_ENVIRONMENT: 'preview' },
    });
    const resolveId = plugin.resolveId;
    if (typeof resolveId !== 'function') {
      throw new Error('expected preview ingress alias plugin to define resolveId');
    }
    expect(
      resolveId.call(
        {} as never,
        'react-router',
        undefined,
        { ssr: true } as never
      )
    ).toBe('/virtual/react-router-with-preview-ingress');
  });
});
