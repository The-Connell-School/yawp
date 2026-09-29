import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node';
import { internalAssignmentTypes } from '~/utils/internal-assignment-types-runtime.server';

export const loader = ({ request }: LoaderFunctionArgs) => internalAssignmentTypes.list(request);
export const action = ({ request }: ActionFunctionArgs) => internalAssignmentTypes.list(request);

