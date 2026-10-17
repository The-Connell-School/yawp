/**
 * The concise lesson plan as a PDF (Brian's run 2, D1), for printing. The
 * full packet stays at packet.pdf. 404 unless lesson_planner_plan_export_v2
 * is on.
 */
import type { LoaderFunctionArgs } from 'react-router';
import { loadLessonPlanDoc } from '~/domain/lesson-planner/load-lesson-plan-doc.server';
import {
  lessonPlanFilename,
  renderLessonPlanPdf,
} from '~/domain/lesson-planner/lesson-plan-render.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const doc = await loadLessonPlanDoc({ request, conversationId: params.conversationId });
  const file = await renderLessonPlanPdf(doc);
  const filename = lessonPlanFilename(doc.title, 'pdf');
  return new Response(file as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(file.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
