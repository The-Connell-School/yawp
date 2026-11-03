import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { createInternalAssignmentTypeWriteHandlers } from '~/utils/internal-assignment-type-writes.server';
const writes = createInternalAssignmentTypeWriteHandlers({ db: prisma });
export const action = ({ request, params }: ActionFunctionArgs) =>
  writes.restore(request, params.id);
export const loader = ({ request, params }: LoaderFunctionArgs) =>
  writes.restore(request, params.id);
