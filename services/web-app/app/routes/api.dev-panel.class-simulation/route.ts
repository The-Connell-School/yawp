import type { ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { assertDevPanelRoute } from '~/dev-panel/dev-panel-route-guard.server';
import {
  classSimulationClearSuccessMessage,
  classSimulationPopulateSuccessMessage,
} from '~/dev-panel/class-simulation-copy';
import {
  CLASS_SIMULATION_MAX_STUDENTS,
  clearDevPanelClassSimulation,
  populateDevPanelClassSimulation,
} from '~/dev-panel/class-simulation.server';
import { getUserId } from '~/utils/auth.server';

const bodySchema = z.discriminatedUnion('intent', [
  z
    .object({
      intent: z.literal('populate'),
      classId: z.string().min(1),
      studentCount: z.coerce
        .number()
        .int()
        .min(1)
        .max(CLASS_SIMULATION_MAX_STUDENTS),
    })
    .strict(),
  z.object({ intent: z.literal('clear'), classId: z.string().min(1) }).strict(),
]);

export async function action({ request }: ActionFunctionArgs) {
  const blocked = await assertDevPanelRoute(request);
  if (blocked) return blocked;
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  const userId = await getUserId(request);
  if (!userId) {
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  }
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (parsed.data.intent === 'clear') {
    const result = await clearDevPanelClassSimulation({
      userId,
      classId: parsed.data.classId,
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json({
      ok: true,
      removedStudents: result.removedStudents,
      message: classSimulationClearSuccessMessage(result.removedStudents),
    });
  }
  const result = await populateDevPanelClassSimulation({
    userId,
    classId: parsed.data.classId,
    studentCount: parsed.data.studentCount,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  const { counts } = result;
  return Response.json({
    ok: true,
    counts,
    message: classSimulationPopulateSuccessMessage(counts),
  });
}
