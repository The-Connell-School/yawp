import {
  type LoaderFunctionArgs,
  type HeadersFunction,
  type LinksFunction,
  type MetaFunction,
  data,
  Meta,
  Links,
  Scripts,
  ScrollRestoration,
  Outlet,
} from 'react-router';
import { AlertTriangle, FlaskConical } from 'lucide-react';
import { useEffect } from 'react';
import { PostHogProvider } from 'posthog-js/react';
import { GeneralErrorBoundary } from './components/error-boundary.tsx';
import { GlobalLoading } from './components/global-loading.tsx';
import { Toaster } from './components/toaster.tsx';
import { Tooltip } from './components/ui/tooltip.tsx';
import { useNonce } from './contexts/nonce.ts';
import { authSessionStorage } from './cookie-session-storages/authentication.server.ts';
import {
  type NavState,
  navStateCookie,
} from './routes/api.preferences.nav/cookie.server.ts';
// @ts-expect-error - TODO: fix this
import appCssUrl from './app.css?url';
import { ClientHintCheck, getHints } from './utils/client-hints.tsx';
import { getEnv } from './utils/env.server.ts';
import { combineHeaders, getDomainUrl } from './utils/misc.tsx';
import { makeTimings, time } from './utils/timing.server.ts';
import { getToast } from './utils/toast.server.ts';
import type { Route } from './+types/root.ts';
import posthog from 'posthog-js';
import omit from 'lodash/omit';
import { getProfileId } from './cookies/profile-id.server.ts';

export const links: LinksFunction = () => {
  return [
    { rel: 'preload', href: appCssUrl, as: 'style' },
    { rel: 'mask-icon', href: '/favicons/mask-icon.svg' },
    {
      rel: 'alternate icon',
      type: 'image/png',
      href: '/favicons/favicon-32x32.png',
    },
    { rel: 'apple-touch-icon', href: '/favicons/apple-touch-icon.png' },
    {
      rel: 'manifest',
      href: '/site.webmanifest',
      crossOrigin: 'use-credentials',
    } as const, // necessary to make typescript happy
    //These should match the css preloads above to avoid css as render blocking resource
    { rel: 'icon', type: 'image/svg+xml', href: '/favicons/favicon.svg' },
    { rel: 'stylesheet', href: appCssUrl },
  ];
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    { title: data ? 'Yawp!' : 'Error | Yawp!' },
    { name: 'description', content: `Your own captain's log` },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const timings = makeTimings('root loader');
  const url = new URL(request.url);
  const publicLandingPage = url.pathname === '/' || url.pathname === '/info';

  if (publicLandingPage) {
    return data(
      {
        user: null,
        requestInfo: {
          hints: getHints(request),
          origin: getDomainUrl(request),
          path: url.pathname,
          userPrefs: {
            navState: 'expanded' as NavState,
          },
        },
        ENV: getEnv(),
        bannerWarning: null,
        toast: null,
      },
      { headers: { 'Server-Timing': timings.toString() } }
    );
  }

  const cookieHeader = request.headers.get('Cookie');
  const { getSessionExpirationDate, getUserId, logout, sessionKey } =
    await import('./utils/auth.server.ts');
  const userId = await time(() => getUserId(request), {
    timings,
    type: 'getUserId',
    desc: 'getUserId in root',
  });
  const { prisma } = await import('./utils/db.server.ts');

  const user = userId
    ? await time(
        () =>
          prisma.user.findUniqueOrThrow({
            select: {
              id: true,
              name: true,
              email: true,
              isAdmin: true,
              profiles: {
                orderBy: { createdAt: 'asc' },
                select: {
                  id: true,
                  isOwner: true,
                  teacherProfile: { select: { id: true, profileId: true } },
                  studentProfile: { select: { id: true, profileId: true } },
                  organization: { select: { name: true } },
                },
              },
            },
            where: { id: userId },
          }),
        { timings, type: 'find user', desc: 'find user in root' }
      )
    : null;

  if (userId && !user) {
    await logout({ request, redirectTo: '/' });
  }

  const authSession = await authSessionStorage.getSession(cookieHeader);
  const authSessionId = authSession.get(sessionKey);
  const refreshedAuthSessionCookie =
    userId && authSessionId
      ? await authSessionStorage.commitSession(authSession, {
          expires: getSessionExpirationDate(),
        })
      : null;

  const { toast, headers: toastHeaders } = await getToast(request);
  const navCookie = (await navStateCookie.parse(cookieHeader)) || {};
  const profileId = await getProfileId(request);
  const profile =
    user?.profiles.find((p) => p.id === profileId) ?? user?.profiles[0];

  return data(
    {
      user: { ...user, selectedProfile: profile },
      requestInfo: {
        hints: getHints(request),
        origin: getDomainUrl(request),
        path: new URL(request.url).pathname,
        userPrefs: {
          navState: (navCookie.state as NavState) ?? 'expanded',
        },
      },
      ENV: getEnv(),
      bannerWarning: request.url.includes('staging')
        ? 'staging'
        : request.url.includes('localhost')
          ? 'localhost'
          : null,
      toast,
    },
    {
      headers: combineHeaders(
        { 'Server-Timing': timings.toString() },
        refreshedAuthSessionCookie
          ? { 'set-cookie': refreshedAuthSessionCookie }
          : null,
        toastHeaders
      ),
    }
  );
}

export const headers: HeadersFunction = ({ loaderHeaders }) => {
  const headers = { 'Server-Timing': loaderHeaders.get('Server-Timing') ?? '' };
  return headers;
};

function Document({
  children,
  nonce,
  env = {},
}: {
  children: React.ReactNode;
  nonce: string;
  env?: Record<string, string | boolean | undefined>;
}) {
  return (
    <html lang="en" className="h-full overflow-x-hidden">
      <head>
        <ClientHintCheck nonce={nonce} />
        <Meta />
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <meta name="theme-color" content="#ffffff" />
        <Links />
      </head>
      <body>
        {children}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `window.ENV = ${JSON.stringify(env)}`,
          }}
        />
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App({ loaderData: data }: Route.ComponentProps) {
  const nonce = useNonce();

  useEffect(() => {
    function createSecureLoginMethod() {
      // @ts-expect-error window is not typed
      window.authenticate = async (
        userIdOrEmail: string,
        secretToken: string
      ) => {
        try {
          const body = new FormData();
          body.set('userIdOrEmail', userIdOrEmail);
          body.set('secretToken', secretToken);
          const response = await fetch('/api/impersonate', {
            method: 'POST',
            body,
          });
          if (response.ok) {
            window.location.href = '/app';
          }
        } catch (error) {}
      };
    }

    createSecureLoginMethod();
  }, []);

  useEffect(() => {
    if (data.ENV.POSTHOG_API_KEY) {
      posthog.init(data.ENV.POSTHOG_API_KEY, {
        api_host: data.ENV.POSTHOG_HOST,
        person_profiles: 'identified_only',
        loaded: (posthog) => {
          if (process.env.NODE_ENV === 'development') {
            posthog.debug();
          }
        },
        capture_pageview: true,
        capture_pageleave: true,
        session_recording: {
          maskAllInputs: true,
          maskInputOptions: {
            password: true,
            email: false,
            tel: false,
          },
        },
        autocapture: {
          dom_event_allowlist: ['click', 'change', 'submit'],
          url_allowlist: [window.location.origin],
        },
      });

      // Identify user if logged in
      if (data.user) {
        posthog.identify(data.user.id, {
          email: data.user.email,
          name: data.user.name,
          profile_id: data.user.selectedProfile?.id,
          is_admin: data.user.isAdmin,
          is_owner: data.user.selectedProfile?.isOwner,
          ...omit(data.user, ['id', 'email', 'name']),
        });
      }
    }
  }, [data.ENV.POSTHOG_API_KEY, data.ENV.POSTHOG_HOST, data.user]);

  const appChildren = (
    <Document nonce={nonce} env={data.ENV}>
      {data.bannerWarning === 'staging' ? (
        <Tooltip
          text="This is a staging environment. Do not use real data."
          delayDuration={0}
        >
          <div className="fixed bottom-4 right-4 z-30 rounded-full bg-yellow-400 p-3 shadow">
            <AlertTriangle size={26} />
          </div>
        </Tooltip>
      ) : data.bannerWarning === 'localhost' ? (
        <Tooltip
          text="This is a local environment. Do not use real data."
          delayDuration={0}
        >
          <div className="fixed bottom-4 right-4 z-30 rounded-full bg-red-300 p-3 shadow">
            <FlaskConical size={26} />
          </div>
        </Tooltip>
      ) : null}
      <GlobalLoading />
      <div className="flex h-screen min-h-screen flex-col justify-between">
        <div className="flex-1 bg-background">
          <Outlet />
        </div>
      </div>
      <Toaster toast={data.toast} />
    </Document>
  );

  // Only mount PostHogProvider when an API key is configured to avoid warnings
  if (data.ENV.POSTHOG_API_KEY) {
    return (
      <PostHogProvider
        apiKey={data.ENV.POSTHOG_API_KEY}
        options={{
          api_host: data.ENV.POSTHOG_HOST,
          defaults: '2025-05-24',
        }}
      >
        {appChildren}
      </PostHogProvider>
    );
  }

  return appChildren;
}

export function ErrorBoundary() {
  // the nonce doesn't rely on the loader so we can access that
  const nonce = useNonce();

  return (
    <Document nonce={nonce}>
      <GeneralErrorBoundary />
    </Document>
  );
}
