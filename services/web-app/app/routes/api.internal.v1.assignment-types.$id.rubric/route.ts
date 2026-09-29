import type { ActionFunctionArgs } from '@remix-run/node';
import { internalAssignmentTypes } from '~/utils/internal-assignment-types-runtime.server';

export const action = ({ request }: ActionFunctionArgs) => internalAssignmentTypes.updatePerType(request);

