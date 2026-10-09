import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { rubricCatalogHttp } from '~/utils/internal-rubric-catalog-runtime.server';
export const loader = ({ request }: LoaderFunctionArgs) => rubricCatalogHttp.clearRelease(request);
export const action = ({ request }: ActionFunctionArgs) => rubricCatalogHttp.clearRelease(request);
