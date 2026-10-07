import type { LoaderFunctionArgs } from 'react-router';
import { rubricCatalogHttp } from '~/utils/internal-rubric-catalog-runtime.server';
export const loader = ({ request }: LoaderFunctionArgs) => rubricCatalogHttp.list(request);