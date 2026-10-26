export * from 'react-router-original';
import { createRequestHandler as baseCreateRequestHandler } from 'react-router-original';
import type { AppLoadContext } from 'react-router';

type CreateRequestHandler = typeof baseCreateRequestHandler;

export const createRequestHandler: CreateRequestHandler = ((
  ...args: Parameters<CreateRequestHandler>
) => {
  const handler = baseCreateRequestHandler(...args);
  return async (request: Request, loadContext?: AppLoadContext) => {
    const { adaptPreviewIngressRequest } = await import(
      '../app/domain/unified-signon/origin.server.ts'
    );
    return handler(adaptPreviewIngressRequest(request), loadContext);
  };
}) as CreateRequestHandler;
