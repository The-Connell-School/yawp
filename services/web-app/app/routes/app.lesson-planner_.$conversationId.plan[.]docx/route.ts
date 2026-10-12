/**
 * The concise lesson plan as a Word file (Brian's run 2, D2): opens in Word
 * and in Google Docs, so a teacher can add their school's standards. A
 * resource route: the response is the file. 404 unless
 * lesson_planner_plan_export_v2 is on.
 */
import type { LoaderFunctionArgs } from 'react-router';
import { loadLessonPlanDoc } from '~/domain/lesson-planner/load-lesson-plan-doc.server';
import {
  lessonPlanFilename,
  renderLessonPlanDocx,
} from '~/domain/lesson-planner/lesson-plan-render.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const doc = await loadLessonPlanDoc({ request, conversationId: params.conversationId });
  const file = await renderLessonPlanDocx(doc);
  const filename = lessonPlanFilename(doc.title, 'docx');
  return new Response(file as unknown as BodyInit, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': String(file.byteLength),
      'Cache-Control': 'private, no-store',
    },
  });
}
