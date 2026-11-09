import {
  type MetaFunction,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  useLoaderData,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import {
  unifiedEntry,
  dispatchUnifiedLogin,
} from '~/domain/unified-signon/entry.server';
import { UnifiedLogin } from '~/components/unified-signon/unified-login';

export async function loader({ request }: LoaderFunctionArgs) {
  return unifiedEntry(request);
}

export async function action(args: ActionFunctionArgs) {
  return dispatchUnifiedLogin(args);
}

export default function LoginPage() {
  const entry = useLoaderData<typeof loader>();
  return <UnifiedLogin entry={entry} />;
}

export const meta: MetaFunction = () => [{ title: 'Login to Yawp!' }];

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}

export function headers() {
  return { 'Cache-Control': 'private, no-store' };
}
