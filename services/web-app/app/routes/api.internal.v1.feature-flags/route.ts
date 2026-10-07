import type { LoaderFunctionArgs } from 'react-router';
import { featureFlagsList } from '~/utils/internal-feature-flags-http.server';

export const loader = ({ request }: LoaderFunctionArgs) => featureFlagsList(request);
