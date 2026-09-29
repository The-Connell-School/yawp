import type { LoaderFunctionArgs } from '@remix-run/node';
import { internalAssignmentTypes } from '~/utils/internal-assignment-types-runtime.server';

export const loader = ({ request }: LoaderFunctionArgs) => internalAssignmentTypes.read(request);

