import type { LoaderFunctionArgs } from 'react-router';
import { internalDirectory } from '~/utils/internal-directory.server';

export const loader = ({ request, params }: LoaderFunctionArgs) => internalDirectory.lookup(request, params.id);
