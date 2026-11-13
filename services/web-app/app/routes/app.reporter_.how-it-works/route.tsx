/**
 * "See how it works": a short, teacher-facing tour of Yawp Reporter, behind
 * the same access check as Reporter. The page itself is reporter-guide.tsx.
 */
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { getReporterAccess } from '~/utils/reporter/reporter-access.server';
import { ReporterGuide } from './reporter-guide';

export async function loader({ request }: LoaderFunctionArgs) {
  const access = await getReporterAccess(request);
  if (!access.allowed) throw redirect('/app');
  return null;
}

export default function ReporterHowItWorksRoute() {
  return <ReporterGuide />;
}
