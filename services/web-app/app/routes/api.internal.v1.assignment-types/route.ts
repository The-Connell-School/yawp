import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { internalAssignmentTypes } from '~/utils/internal-assignment-types-runtime.server';

export const loader = ({ request }: LoaderFunctionArgs) => internalAssignmentTypes.list(request);
export const action = ({ request }: ActionFunctionArgs) => internalAssignmentTypes.list(request);

