import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { internalRubrics } from '~/utils/internal-rubrics-runtime.server';
export const loader = ({ request }: LoaderFunctionArgs) => internalRubrics.validate(request);
export const action = ({ request }: ActionFunctionArgs) => internalRubrics.validate(request);
