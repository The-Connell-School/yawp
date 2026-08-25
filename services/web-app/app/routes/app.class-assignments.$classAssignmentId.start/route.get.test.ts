import { describe, expect, mock, test } from 'bun:test';
import { createStaticHandler } from 'react-router';

describe('GET /app/class-assignments/:id/start is handled as a data/resource request', () => {
  test('React Router throws missing-loader error for route id routes/app.class-assignments.$classAssignmentId.start', async () => {
    // Guard against DB/Auth side-effects when importing the real route module
    mock.module('~/utils/db.server', () => ({ prisma: {} }));
    mock.module('~/utils/auth.server', () => ({ requireUserId: () => {}, requireMembership: () => ({}) }));
    mock.module('~/domain/documents.server', () => ({
      createDocumentForAssignmentType: async () => ({ documentId: 'doc-1' }),
      DocumentCreationError: class DocumentCreationError extends Error {},
    }));

    const mod: Record<string, unknown> = await import('./route');

    const routes = [
      {
        id: 'root',
        path: '/',
        children: [
          {
            id: 'routes/app',
            path: 'app',
            children: [
              {
                id: 'routes/app.class-assignments.$classAssignmentId.start',
                path: 'class-assignments/:classAssignmentId/start',
                loader: (mod as any).loader,
              },
            ],
          },
        ],
      },
    ] as any;
    const handler = createStaticHandler(routes);
    const req = new Request(
      'https://example.test/app/class-assignments/cmsun2cox06yd01l9yctvkeij/start',
      { method: 'GET' }
    );
    try {
      const res = await handler.queryRoute(req, {
        routeId: 'routes/app.class-assignments.$classAssignmentId.start',
      });
      expect(res).toBeInstanceOf(Response);
    } catch (e: any) {
      // Re-throw the inner Error to surface the exact RR message in output
      if (e && typeof e === 'object' && 'error' in e && e.error instanceof Error) {
        throw e.error;
      }
      throw e;
    }
  });
});

