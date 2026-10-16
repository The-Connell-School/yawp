import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { duplicateClassCodes } from '~/utils/internal-class-code-duplicates.server';

export const loader = ({ request }: LoaderFunctionArgs) => duplicateClassCodes(request);
export const action = ({ request }: ActionFunctionArgs) => duplicateClassCodes(request);
