import { describe, expect, test } from 'bun:test';
import { createStaticHandler } from 'react-router';

describe('GET /app/assignments/:assignmentId/start is handled as a data/resource request', () => {
  test('React Router throws missing-loader error for route id routes/app.assignments.$assignmentId.start', async () => {
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
                id: 'routes/app.assignments.$assignmentId.start',
                path: 'assignments/:assignmentId/start',
              },
            ],
          },
        ],
      },
    ] as any;
    const handler = createStaticHandler(routes);
    const req = new Request(
      'https://example.test/app/assignments/assignment-123/start',
      { method: 'GET' }
    );
    try {
      const res = await handler.queryRoute(req, {
        routeId: 'routes/app.assignments.$assignmentId.start',
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

