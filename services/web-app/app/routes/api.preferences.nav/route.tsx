import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { type Fetcher, useFetcher, useFetchers } from 'react-router';
import {
  ValidatedForm,
  validationError,
  parseFormData,
} from '@rvf/react-router';
import { z } from 'zod';
import { useRequestInfo } from '~/hooks/useRequestInfo';

// Preference:
// for left navigation menu width (collapsed or expanded).

type NavState = 'expanded' | 'collapsed';

const path = '/api/preferences/nav';
const Schema = z.object({ state: z.enum(['expanded', 'collapsed']) });

export async function action({ request }: ActionFunctionArgs) {
  const { navStateCookie } = await import('./cookie.server');
  const { error, data } = await parseFormData(request, Schema);
  if (error) return validationError(error);

  const cookieHeader = request.headers.get('Cookie');
  const cookie = (await navStateCookie.parse(cookieHeader)) ?? {};
  cookie.state = data.state;
  return dataResponse(
    {},
    { headers: { 'Set-Cookie': await navStateCookie.serialize(cookie) } }
  );
}

export function useNavState() {
  const requestInfo = useRequestInfo();
  const optimistic = useOptimisticNavState();
  if (optimistic) return optimistic;
  return requestInfo.userPrefs.navState ?? 'expanded';
}

function useOptimisticNavState() {
  const fetchers = useFetchers();
  const f = fetchers.find((f) => f.formAction === path);
  if (f && f.formData)
    return f.formData.get('state') === 'collapsed' ? 'collapsed' : 'expanded';
}

type Props = {
  children: (params: { state: NavState; fetcher: Fetcher }) => React.ReactNode;
};

export function NavStateSwitch({ children }: Props) {
  const fetcher = useFetcher<typeof action>();
  const navState = useNavState();
  const optimistic = useOptimisticNavState();
  const state = optimistic ?? navState ?? 'expanded';
  const nextState = state === 'expanded' ? 'collapsed' : 'expanded';

  return (
    <ValidatedForm
      method="POST"
      action={path}
      schema={Schema}
      fetcher={fetcher}
      defaultValues={{ state: navState }}
    >
      <input type="hidden" name="state" value={nextState} />
      {children({ fetcher, state })}
    </ValidatedForm>
  );
}
