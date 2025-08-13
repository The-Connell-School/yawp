import { PassThrough } from 'node:stream';
import type { EntryContext, HandleErrorFunction } from 'react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
import { ServerRouter } from 'react-router';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';
import { getUserId } from './utils/auth.server';
import { posthog } from './services/posthog.server';

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext
) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get('user-agent');

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    let readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? 'onAllReady'
        : 'onShellReady';

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set('Content-Type', 'text/html');

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // Log streaming rendering errors from inside the shell.  Don't log
          // errors encountered during initial shell rendering since they'll
          // reject and get logged in handleDocumentRequest.
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
    setTimeout(abort, streamTimeout + 1000);
  });
}

export const handleError: HandleErrorFunction = async (error, args) => {
  const { request, params } = args;

  // React Router may abort some interrupted requests, don't log those
  if (request.signal.aborted) {
    return;
  }

  console.log('🔥 Error caught by handleError:', error);

  try {
    // Get user context for better error tracking
    const userId = await getUserId(request).catch(() => null);

    // Build comprehensive error context
    const errorContext = {
      timestamp: new Date().toISOString(),
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : 'UnknownError',
      },
      request: {
        method: request.method,
        url: request.url,
        headers: Object.fromEntries(request.headers.entries()),
        userAgent: request.headers.get('user-agent'),
      },
      route: {
        params,
      },
      user: userId ? { id: userId } : null,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        timestamp: Date.now(),
      },
    };

    // Always log to console
    console.error('Server Error Details:', errorContext);

    // Log to PostHog in production
    if (posthog) {
      posthog.captureException(error, userId ?? 'anonymous');
    } else {
      throw error;
    }
  } catch (loggingError) {
    // Fallback logging if our error logger fails
    console.error('❌ Error logging failed:', loggingError);
    console.error('Original error:', error);
  }
};

async function logToFile(errorContext: any) {
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    // Ensure logs directory exists
    const logsDir = path.join(process.cwd(), 'logs');
    await fs.mkdir(logsDir, { recursive: true });

    // Log to daily file
    const logFile = path.join(
      logsDir,
      `errors-${new Date().toISOString().split('T')[0]}.log`
    );
    await fs.appendFile(logFile, JSON.stringify(errorContext) + '\n');

    console.log(`📁 Error logged to: ${logFile}`);
  } catch (error) {
    console.error('File logging failed:', error);
  }
}
