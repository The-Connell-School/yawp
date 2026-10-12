import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { tokensCreate, tokensList } from '~/utils/internal-free-tier-http.server';

export const loader = ({ request }: LoaderFunctionArgs) => tokensList(request);
export const action = ({ request }: ActionFunctionArgs) => tokensCreate(request);

