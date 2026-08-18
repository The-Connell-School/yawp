import { redirect, type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { setSchoolYearScope } from '~/cookies/school-year.server';
import { ALL_SCHOOL_YEARS, isSchoolYear } from '~/utils/school-year';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') return redirect('/app');

  await requireUserId(request);

  const formData = await request.formData();
  const requested = formData.get('year')?.toString() ?? '';
  const redirectTo = request.headers.get('Referer') || '/app';

  // Anything we do not recognise leaves the current scope alone rather than
  // writing a value that would later have to be defended against.
  if (requested !== ALL_SCHOOL_YEARS && !isSchoolYear(requested)) {
    return redirect(redirectTo);
  }

  return redirect(redirectTo, {
    headers: { 'set-cookie': await setSchoolYearScope(requested) },
  });
}
