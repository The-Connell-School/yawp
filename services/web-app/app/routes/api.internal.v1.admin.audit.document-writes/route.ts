import type { LoaderFunctionArgs } from 'react-router';
import { adminAudit } from '~/utils/internal-admin-audit-runtime.server';
export const loader = ({ request, params }: LoaderFunctionArgs) =>
  adminAudit.writes(request);
