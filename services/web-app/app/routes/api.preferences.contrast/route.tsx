import {
  type ActionFunctionArgs,
  data as dataResponse,
  type Fetcher,
  useFetcher,
  useFetchers,
} from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { useRequestInfo } from '~/hooks/useRequestInfo';
import type { ContrastPreference } from './cookie.server';

const path = '/api/preferences/contrast';
const Schema = z.object({ contrast: z.enum(['standard', 'high']) });

export async function action({ request }: ActionFunctionArgs) {
  const { contrastPreferenceCookie } = await import('./cookie.server');
  const { error, data } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  const cookieHeader = request.headers.get('Cookie');
  const cookie = (await contrastPreferenceCookie.parse(cookieHeader)) ?? {};
  cookie.contrast = data.contrast;
  return dataResponse(
    {},
    {
      headers: {
        'Set-Cookie': await contrastPreferenceCookie.serialize(cookie),
      },
    }
  );
}

export function useContrastPreference() {
  const requestInfo = useRequestInfo();
  const optimistic = useOptimisticContrastPreference();
  if (optimistic) return optimistic;
  return requestInfo.userPrefs.contrastPreference ?? 'standard';
}

function useOptimisticContrastPreference() {
  const fetchers = useFetchers();
  const fetcher = fetchers.find((f) => f.formAction === path);
  const value = fetcher?.formData?.get('contrast');
  if (value === 'high' || value === 'standard') return value;
}

type Props = {
  children: (params: {
    fetcher: Fetcher;
    highContrast: boolean;
    preference: ContrastPreference;
    setPreference: (preference: ContrastPreference) => void;
  }) => React.ReactNode;
};

export function ContrastPreferenceSwitch({ children }: Props) {
  const fetcher = useFetcher<typeof action>();
  const preference = useContrastPreference();

  function setPreference(nextPreference: ContrastPreference) {
    const formData = new FormData();
    formData.set('contrast', nextPreference);
    void fetcher.submit(formData, { method: 'POST', action: path });
  }

  return children({
    fetcher,
    highContrast: preference === 'high',
    preference,
    setPreference,
  });
}
