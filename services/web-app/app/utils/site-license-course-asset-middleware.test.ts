import { describe, expect, mock, test } from 'bun:test';
import type { RouterContextProvider } from 'react-router';
import { SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE } from '~/domain/free-tier/site-license-how-to-teach';

const gate = { block: true };

mock.module('~/domain/free-tier/site-license-how-to-teach.server', () => ({
  shouldBlockSiteLicenseCourseAsset: async () => gate.block,
}));

const { siteLicenseCourseAssetMiddleware } = await import(
  './site-license-course-asset-middleware.server'
);

function middlewareArgs(request: Request) {
  return {
    request,
    params: {},
    context: {} as RouterContextProvider,
    url: new URL(request.url),
    pattern: '/courses/thesis-driven-essay/*',
  } as Parameters<typeof siteLicenseCourseAssetMiddleware>[0];
}

describe('siteLicenseCourseAssetMiddleware', () => {
  test('returns 403 for locked thesis course assets', async () => {
    gate.block = true;
    const request = new Request(
      'http://localhost/courses/thesis-driven-essay/02-pre-writing.pptx'
    );
    let nextCalled = false;
    const response = (await siteLicenseCourseAssetMiddleware(
      middlewareArgs(request),
      async () => {
        nextCalled = true;
        return new Response('ok');
      }
    )) as Response;
    expect(nextCalled).toBe(false);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe(SITE_LICENSE_HOW_TO_TEACH_LOCK_MESSAGE);
  });

  test('delegates when the gate allows access', async () => {
    gate.block = false;
    const request = new Request(
      'http://localhost/courses/thesis-driven-essay/02-pre-writing.pptx'
    );
    const response = (await siteLicenseCourseAssetMiddleware(
      middlewareArgs(request),
      async () => new Response('passed', { status: 204 })
    )) as Response;
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('passed');
  });
});