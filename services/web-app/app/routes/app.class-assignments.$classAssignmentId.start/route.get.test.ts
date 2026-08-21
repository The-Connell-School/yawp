import { describe, expect, test } from 'bun:test';
import { createStaticHandler } from 'react-router';

describe('GET /app/class-assignments/:id/start is handled as a data/resource request', () => {
  test('React Router throws missing-loader error for route id routes/app.class-assignments.$classAssignmentId.start', async () => {
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
      if (e && typeof e === 'object' && 'error' in e && e.error instanceof Error) {
        throw e.error;
      }
      throw e;
    }
  });
});

