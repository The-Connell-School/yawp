import { type LoaderFunctionArgs, redirect } from 'react-router';

/**
 * The assignment detail page used to live here, nested inside the class route.
 * It now stands on its own at /app/assignments/:assignmentId, which carries the
 * class as `?classId=` because one assignment can be deployed to several
 * classes. This route stays behind only to forward links and open tabs that
 * still point at the old nested URL.
 */
export async function loader({ params, request }: LoaderFunctionArgs) {
  const { classId, assignmentId } = params;
  const search = new URL(request.url).searchParams;
  if (classId) search.set('classId', classId);
  return redirect(`/app/assignments/${assignmentId}?${search.toString()}`, {
    status: 301,
  });
}
