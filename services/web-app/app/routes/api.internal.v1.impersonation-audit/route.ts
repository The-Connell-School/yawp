import type { LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { auditSelect, createAuditHandler } from '~/utils/internal-audit.server';

const read = createAuditHandler({
  findMany: query => prisma.internalImpersonationEvent.findMany({ ...query, select: auditSelect }),
}, () => process.env.YAWP_MANAGEMENT_SERVICE_KEY);

export const loader = ({ request }: LoaderFunctionArgs) => read(request);
