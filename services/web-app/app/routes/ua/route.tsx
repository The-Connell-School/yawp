import {
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { UaPartnerEntry } from '~/components/ua-partner-entry';
import {
  loadUaPartnerEntry,
  submitUaPartnerEntry,
} from '~/domain/ua-partner-entry.server';

export async function loader({ request }: LoaderFunctionArgs) {
  return loadUaPartnerEntry(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return submitUaPartnerEntry(request);
}

export default function UaLandingRoute() {
  const loaderData = useLoaderData<typeof loader>();
  return (
    <UaPartnerEntry
      authenticated={loaderData.authenticated}
      codeAccepted={loaderData.codeAccepted}
      signupHref="/ua/sign-up"
      loginHref="/ua/sign-in"
    />
  );
}
