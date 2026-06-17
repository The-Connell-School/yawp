import { redirect, type LoaderFunctionArgs } from 'react-router';
import { requireAdmin } from '~/utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  return redirect('/app/admin/organizations');
}
