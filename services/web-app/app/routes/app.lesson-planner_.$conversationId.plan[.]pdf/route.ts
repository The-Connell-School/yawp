/**
 * The concise lesson plan as a PDF (Brian's run 2, D1), for printing. The
 * full packet stays at packet.pdf. 404 unless lesson_planner_plan_export_v2
 * is on.
 */
import type { LoaderFunctionArgs } from 'react-router';
import { loadLessonPlan } from '~/domain/lesson-planner/load-lesson-plan-doc.server';
import { renderKitPlanPdf } from '~/domain/lesson-planner/kit-plan-render.server';
import {
  lessonPlanFilename,
  renderLessonPlanPdf,
} from '~/domain/lesson-planner/lesson-plan-render.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { doc, kit } = await loadLessonPlan({ request, conversationId: params.conversationId });
  // With the Lesson Deck Kit on, the plan to its lesson plan spec v1.
  const file = kit ? await renderKitPlanPdf(kit) : await renderLessonPlanPdf(doc);
  const filename = lessonPlanFilename(kit?.title ?? doc.title, 'pdf');
  return new Response(file as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(file.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
