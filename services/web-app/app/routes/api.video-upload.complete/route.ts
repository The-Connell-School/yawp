import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import { completeMultipartUpload } from '~/services/s3.server';

async function actionHandler({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const key = form.get('key')?.toString();
  const uploadId = form.get('uploadId')?.toString();
  const partsJson = form.get('parts')?.toString();
  if (!key || !uploadId || !partsJson) {
    return new Response('Missing parameters', { status: 400 });
  }
  const parts = JSON.parse(partsJson) as { ETag: string; PartNumber: number }[];
  await completeMultipartUpload(key, uploadId, parts);
  return dataResponse({ success: true });
}
