import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { freeTierLimitsHttp } from '~/utils/internal-free-tier-limits.server';

export const loader = ({ request }: LoaderFunctionArgs) => freeTierLimitsHttp(request);
export const action = ({ request }: ActionFunctionArgs) => freeTierLimitsHttp(request);
