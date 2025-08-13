import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import { abortMultipartUpload } from '~/services/s3.server';

export async function action({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const key = form.get('key')?.toString();
  const uploadId = form.get('uploadId')?.toString();
  if (!key || !uploadId) {
    return new Response('Missing parameters', { status: 400 });
  }
  await abortMultipartUpload(key, uploadId);
  return dataResponse({ success: true });
}
