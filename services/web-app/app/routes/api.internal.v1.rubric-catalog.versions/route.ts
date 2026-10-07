import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { rubricCatalogHttp } from '~/utils/internal-rubric-catalog-runtime.server';
export const loader = ({ request }: LoaderFunctionArgs) => rubricCatalogHttp.save(request);
export const action = ({ request }: ActionFunctionArgs) => rubricCatalogHttp.save(request);