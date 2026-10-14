import { createContext, type MiddlewareFunction } from 'react-router';

// React Router strips routing parameters using URLSearchParams before invoking
// loaders. That also normalizes encoding (e.g. %20 to +), which changes HMAC
// input. Capture this signed-only resource's request at the middleware boundary.
export const testerFeedbackRequestContext = createContext<Request>();

export const preserveTesterFeedbackRequest: MiddlewareFunction<Response> =
  ({ request, context }, next) => {
    context.set(testerFeedbackRequestContext, request);
    return next();
  };
