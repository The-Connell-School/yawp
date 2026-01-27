import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { setSubmittedPapersFilter } from '~/utils/cookies.server';

const Schema = z.object({
  filter: z.enum(['all', 'graded', 'non-graded']),
});

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  const cookie = await setSubmittedPapersFilter(request, data.filter);
  return dataResponse({}, { headers: { 'Set-Cookie': cookie } });
}
