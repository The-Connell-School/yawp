import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { gradeGateDeclines } from '~/utils/internal-grade-gate-declines.server';

export const loader = ({ request }: LoaderFunctionArgs) => gradeGateDeclines(request);
export const action = ({ request }: ActionFunctionArgs) => gradeGateDeclines(request);
