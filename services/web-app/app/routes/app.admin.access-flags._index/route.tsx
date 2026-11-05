import { GeneralErrorBoundary } from '~/components/error-boundary';
import AdminAccessFlagsPage from './admin-access-flags-page';

export { loader, action } from './route.server';

export default AdminAccessFlagsPage;

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
