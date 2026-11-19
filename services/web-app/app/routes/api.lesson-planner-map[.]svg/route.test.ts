import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireLessonPlannerAccess = mock();
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({ requireLessonPlannerAccess }));
const { loader } = await import('./route');
afterAll(() => mock.restore());

const get = (query: string) => loader({ request: new Request(`http://localhost/api/lesson-planner-map.svg?${query}`) } as never) as Promise<Response>;

describe('api.lesson-planner-map.svg', () => {
  beforeEach(() => {
    requireLessonPlannerAccess.mockReset().mockResolvedValue({ membership: { id: 'teacher-1' } });
  });

  test('a view comes back as an SVG picture that can be kept for good', async () => {
    const response = await get('v=20,3,40,24&shade=Sudan%7CSouth+Sudan&route=32.53,15.55;31.24,30.04&c=2F5873');
    expect(response.headers.get('Content-Type')).toContain('image/svg+xml');
    expect(response.headers.get('Cache-Control')).toContain('immutable');
    const svg = await response.text();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('stroke-dasharray');
    expect(svg).toContain('#2F5873');
    // Nothing from the address is written into the picture as it came.
    expect(svg).not.toContain('Sudan');
  });

  test('not a view: refused; not signed in to the planner: whatever the access check does', async () => {
    await expect(get('v=1,2')).rejects.toMatchObject({ status: 400 });
    await expect(get('v=20,3,40,24&c=%22%3E%3Cscript%3E')).resolves.toBeInstanceOf(Response);
    expect(await (await get('v=20,3,40,24&c=%22%3E%3Cscript%3E')).text()).not.toContain('script');
    requireLessonPlannerAccess.mockRejectedValue(new Response(null, { status: 302 }));
    await expect(get('v=20,3,40,24')).rejects.toMatchObject({ status: 302 });
  });
});
