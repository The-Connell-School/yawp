import { devLoginOptionsLoader } from '../auth.dev-login/bound.server';

// Resource route used by the Beaker menu. Keeping this as a loader-only module
// prevents the server-bound database dependencies from entering the client bundle.
export const loader = devLoginOptionsLoader;
