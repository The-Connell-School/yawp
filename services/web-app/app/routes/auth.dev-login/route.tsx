import { devLoginAction } from './bound.server';

// `action` is deliberately the only export here. React Router strips loader/action from
// the client bundle; any other named export keeps its server imports in the browser
// build and Vite rejects the route. See bound.server.ts.
export const action = devLoginAction;
