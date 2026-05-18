import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import {
  buildModuleVideoKey,
  startMultipartUpload,
} from '~/services/s3.server';

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const teacherTrainingId = form.get('teacherTrainingId')?.toString();
  const moduleId = form.get('moduleId')?.toString();
  const fileName = form.get('fileName')?.toString();
  const contentType =
    form.get('contentType')?.toString() || 'application/octet-stream';

  if (!teacherTrainingId || !moduleId || !fileName) {
    return new Response('Missing parameters', { status: 400 });
  }

  const key = buildModuleVideoKey(teacherTrainingId, moduleId, fileName);
  const { uploadId } = await startMultipartUpload(key, contentType);

  return dataResponse({ key, uploadId });
}
