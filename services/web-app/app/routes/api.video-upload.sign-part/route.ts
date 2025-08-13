import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import { signPartUpload } from '~/services/s3.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const key = url.searchParams.get('key');
  const uploadId = url.searchParams.get('uploadId');
  const partNumber = Number(url.searchParams.get('partNumber'));
  if (!key || !uploadId || !partNumber) {
    return new Response('Missing parameters', { status: 400 });
  }
  const signed = await signPartUpload(key, uploadId, partNumber);
  return dataResponse({ url: signed });
}
