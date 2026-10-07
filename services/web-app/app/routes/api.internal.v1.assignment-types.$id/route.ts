import type { LoaderFunctionArgs } from 'react-router';
import { internalAssignmentTypes } from '~/utils/internal-assignment-types-runtime.server';

export const loader = ({ request }: LoaderFunctionArgs) => internalAssignmentTypes.read(request);

