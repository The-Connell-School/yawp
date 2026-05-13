import { describe, expect, test } from 'bun:test';

type RouteConfig = Array<{
  id?: string;
  path?: string;
  children?: RouteConfig;
}>;

function flattenRoutes(
  routeConfig: RouteConfig,
  flattened: Array<{ id?: string; path?: string }> = []
) {
  for (const route of routeConfig) {
    flattened.push({ id: route.id, path: route.path });
    if (route.children) flattenRoutes(route.children, flattened);
  }
  return flattened;
}

describe('grade essay AI route registration', () => {
  test('registers React Router data suffix endpoint used by fetcher submissions', async () => {
    globalThis.__reactRouterAppDirectory = `${process.cwd()}/app`;
    const { default: routes } = await import('~/routes');
    const flattened = flattenRoutes(await routes);

    expect(flattened).toContainEqual(
      expect.objectContaining({
        id: 'routes/api.domain.grade-essay-ai[.]data',
        path: 'api/domain/grade-essay-ai.data',
      })
    );
  });
});
