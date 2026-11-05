import { describe, expect, mock, test, beforeEach } from 'bun:test';

const populateDevPanelClassSimulation = mock();
const clearDevPanelClassSimulation = mock();

mock.module('~/dev-panel/dev-panel-route-guard.server', () => ({
  assertDevPanelRoute: mock().mockResolvedValue(null),
}));

mock.module('~/utils/auth.server', () => ({
  getUserId: mock().mockResolvedValue('user-1'),
}));

mock.module('~/dev-panel/class-simulation.server', () => ({
  CLASS_SIMULATION_MAX_STUDENTS: 40,
  populateDevPanelClassSimulation,
  clearDevPanelClassSimulation,
}));

const { action } = await import('./route');

describe('api.dev-panel.class-simulation action', () => {
  beforeEach(() => {
    populateDevPanelClassSimulation.mockReset();
    clearDevPanelClassSimulation.mockReset();
  });

  test('clear intent only clears simulated students', async () => {
    clearDevPanelClassSimulation.mockResolvedValue({
      ok: true,
      removedStudents: 4,
    });

    const response = await action({
      request: new Request('http://localhost/api/dev-panel/class-simulation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent: 'clear', classId: 'class-1' }),
      }),
    } as any);

    expect(clearDevPanelClassSimulation).toHaveBeenCalledTimes(1);
    expect(populateDevPanelClassSimulation).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message).toContain('Cleared 4 simulated students');
  });

  test('populate intent only populates simulated students', async () => {
    populateDevPanelClassSimulation.mockResolvedValue({
      ok: true,
      counts: { students: 20, assignments: 3 },
    });

    const response = await action({
      request: new Request('http://localhost/api/dev-panel/class-simulation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          intent: 'populate',
          classId: 'class-1',
          studentCount: 20,
        }),
      }),
    } as any);

    expect(populateDevPanelClassSimulation).toHaveBeenCalledTimes(1);
    expect(clearDevPanelClassSimulation).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.message).toContain('Added 20 students');
  });
});
