import type { ActionFunctionArgs } from 'react-router';
import { internalAssignmentTypes } from '~/utils/internal-assignment-types-runtime.server';

export const action = ({ request }: ActionFunctionArgs) => internalAssignmentTypes.relink(request);

