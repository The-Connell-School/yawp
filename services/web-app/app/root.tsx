import { TesterFeedbackWidget } from './components/tester-feedback-widget';
import { DemoFeedbackWidget } from './components/demo-feedback-widget';
import { sanitizeDemoFeedbackEvent } from './utils/demo-feedback-context';
import { isDemoFeedbackAvailable } from './utils/demo-feedback-runtime.server';
import { internalImpersonationMiddleware } from './utils/internal-impersonation-runtime.server';
import { getImpersonationAttribution } from './utils/internal-impersonation-context.server';
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
  useRouteLoaderData,
} from 'react-router';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { GeneralErrorBoundary } from './components/error-boundary.tsx';
import { GlobalLoading } from './components/global-loading.tsx';
import { Toaster } from './components/toaster.tsx';
import { useNonce } from './contexts/nonce.ts';
import { useInternalCopyMarker } from './hooks/useInternalCopyMarker.ts';
import { authSessionStorage } from './cookie-session-storages/authentication.server.ts';
import {
  type NavState,
  navStateCookie,
} from './routes/api.preferences.nav/cookie.server.ts';
import {
  type ContrastPreference,
  contrastPreferenceCookie,
} from './routes/api.preferences.contrast/cookie.server.ts';
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
import { getMembershipId } from './cookies/membership-id.server.ts';
import { LocalDevEnvironmentBar } from './components/local-dev-environment-bar.tsx';
import { DevPanelMount } from './dev-panel/dev-panel-entry.tsx';
import { devPanelRestoreInlineScript } from './dev-panel/dev-panel-restore-inline.ts';
import { formatDevPanelBuildFooter } from './dev-panel/dev-panel-build-footer.ts';
import {
  devPanelEnvBadge,
  isDevPanelRuntimeEnabled,
} from './dev-panel/dev-panel-runtime.server.ts';
import { getBuildMetadata } from './utils/build-metadata.server.ts';
import { isLocalDevAuthEnabled } from './utils/local-dev-auth.server.ts';
import { isBlackboardLtiMockUiEnabled } from './utils/blackboard-lti-mock-ui.server.ts';
import { useContrastPreference } from './routes/api.preferences.contrast/route.tsx';
import {
  getEnvironmentBannerWarning,
  shouldEnableLocalDevQuickLogin,
} from './utils/environment-banner.server.ts';
import {
  getDevPanelUnlockSeatLabel,
  getPreviewAccessSeat,
  isIsolatedPreviewSeatMode,
  isPreviewDevLoginAccessCodeRequired,
  previewAccessMiddleware,
} from './utils/preview-access.server.ts';
import { uaPartnerMiddleware } from './utils/ua-partner.server.ts';
import { isLessonPlannerEnabled } from './domain/feature-flags/feature-flags.server.ts';
import { getRootMembershipWhere } from './utils/root-membership-filter.server.ts';

export const middleware = [internalImpersonationMiddleware, previewAccessMiddleware, uaPartnerMiddleware];

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
  const internal = getImpersonationAttribution();
  const url = new URL(request.url);
  const publicLandingPage =
    url.pathname === '/' ||
    url.pathname === '/info' ||
    /^\/(privacy|terms)(?:\/|\.data)?$/.test(url.pathname) ||
    // A shared lesson (Lesson Planner run 3) opens without a login.
    /^\/l\/[\w-]+(?:\.data)?$/.test(url.pathname) ||
    url.pathname === '/auth/preview-access' ||
    url.pathname === '/auth/preview-access.data';
  const cookieHeader = request.headers.get('Cookie');
  const contrastCookie =
    (await contrastPreferenceCookie.parse(cookieHeader)) || {};
  const contrastPreference: ContrastPreference =
    contrastCookie.contrast === 'high' ? 'high' : 'standard';

  if (publicLandingPage && !internal) {
    const previewAccessSeat = isPreviewDevLoginAccessCodeRequired()
      ? await getPreviewAccessSeat(request)
      : null;
    const devPanelUnlockSeatLabel = isPreviewDevLoginAccessCodeRequired()
      ? await getDevPanelUnlockSeatLabel(request)
      : null;
    const devPanelEnabled = isDevPanelRuntimeEnabled();
    let user = null;
    if (devPanelEnabled) {
      const { getUserId } = await import('./utils/auth.server.ts');
      const { prisma } = await import('./utils/db.server.ts');
      const userId = await getUserId(request);
      const membershipWhere = userId
        ? await getRootMembershipWhere({
            userId,
            internal,
            previewAccessSeat,
            isolatedPreviewSeatMode: isIsolatedPreviewSeatMode(),
          })
        : undefined;
      const userRecord = userId
        ? await prisma.user.findUnique({
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              mustChangePassword: true,
              isTester: process.env.TESTER_FEEDBACK_ENABLED === 'true',
              isAdmin: true,
              memberships: {
                ...(membershipWhere ? { where: membershipWhere } : {}),
                orderBy: { createdAt: 'asc' },
                select: {
                  id: true,
                  role: true,
                  isOrgOwner: true,
                  organizationId: true,
                  organization: {
                    select: {
                      name: true,
                      plan: true,
                      reporterEnabled: true,
                      classInsightsEnabled: true,
                      writingPracticeEnabled: true,
                      submissionActivityEnabled: true,
                    },
                  },
                },
              },
            },
            where: { id: userId },
          })
        : null;
      const membershipId = await getMembershipId(request);
      const selectedMembership =
        userRecord?.memberships.find((m) => m.id === membershipId) ??
        userRecord?.memberships[0];
      user = userRecord
        ? {
            ...userRecord,
            isAdmin: Boolean(userRecord.isAdmin),
            selectedMembership,
          }
        : null;
    }
    return data(
      {
        testerFeedbackAvailable: false,
        demoFeedbackAvailable: false,
        user,
        internalImpersonation: null,
        requestInfo: {
          hints: getHints(request),
          origin: getDomainUrl(request),
          path: url.pathname,
          userPrefs: {
            navState: 'expanded' as NavState,
            contrastPreference,
          },
        },
        ENV: getEnv(),
        bannerWarning: getEnvironmentBannerWarning(request.url),
        localDevQuickLogin: {
          enabled: shouldEnableLocalDevQuickLogin({
            bannerWarning: getEnvironmentBannerWarning(request.url),
            localDevAuthEnabled: isLocalDevAuthEnabled(),
          }),
        },
        previewAccessGateEnabled: isPreviewDevLoginAccessCodeRequired(),
        previewAccessSeat,
        devPanelUnlockSeatLabel,
        blackboardLtiMockEnabled: isBlackboardLtiMockUiEnabled(),
        devPanelEnabled,
        devPanelEnvBadge: devPanelEnvBadge(),
        devPanelBuildFooter: formatDevPanelBuildFooter(getBuildMetadata()),
        lessonPlannerEnabled: false,
        impersonation: { isReadOnly: false, impersonatorUserId: null },
        toast: null,
      },
      { headers: { 'Server-Timing': timings.toString() } }
    );
  }

  const {
    getImpersonationState,
    getAuthSessionCookieExpiresAt,
    getUserId,
    logout,
    sessionKey,
  } = await import('./utils/auth.server.ts');
  const userId = await time(() => getUserId(request), {
    timings,
    type: 'getUserId',
    desc: 'getUserId in root',
  });
  const { prisma } = await import('./utils/db.server.ts');
  const previewAccessSeat = isPreviewDevLoginAccessCodeRequired()
    ? await getPreviewAccessSeat(request)
    : null;
  const devPanelUnlockSeatLabel = isPreviewDevLoginAccessCodeRequired()
    ? await getDevPanelUnlockSeatLabel(request)
    : null;
  const membershipWhere = userId
    ? await getRootMembershipWhere({
        userId,
        internal,
        previewAccessSeat,
        isolatedPreviewSeatMode: isIsolatedPreviewSeatMode(),
      })
    : undefined;

  const user = userId
    ? await time(
        () =>
          prisma.user.findUniqueOrThrow({
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              mustChangePassword: true,
              isTester: process.env.TESTER_FEEDBACK_ENABLED === 'true',
              isAdmin: true,
              memberships: {
                ...(membershipWhere ? { where: membershipWhere } : {}),
                orderBy: { createdAt: 'asc' },
                select: {
                  id: true,
                  role: true,
                  isOrgOwner: true,
                  organizationId: true,
                  organization: {
                    select: {
                      name: true,
                      plan: true,
                      reporterEnabled: true,
                      classInsightsEnabled: true,
                      writingPracticeEnabled: true,
                      submissionActivityEnabled: true,
                    },
                  },
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
          expires: await getAuthSessionCookieExpiresAt({
            sessionId: authSessionId,
            userEmail: user?.email ?? null,
          }),
        })
      : null;

  const { toast, headers: toastHeaders } = await getToast(request);
  const navCookie = (await navStateCookie.parse(cookieHeader)) || {};
  const membershipId = await getMembershipId(request);
  const membership =
    user?.memberships.find((m) => m.id === membershipId) ??
    user?.memberships[0];
  const impersonation = await getImpersonationState(request);
  const bannerWarning = getEnvironmentBannerWarning(request.url);
  const localDevQuickLoginEnabled = shouldEnableLocalDevQuickLogin({
    bannerWarning,
    localDevAuthEnabled: isLocalDevAuthEnabled(),
  });
  const lessonPlannerEnabled = userId
    ? await isLessonPlannerEnabled(membership?.organizationId ?? null)
    : false;

  return data(
    {
      user: user
        ? {
            ...user,
            isAdmin: Boolean(user.isAdmin),
            selectedMembership: membership,
          }
        : null,
      testerFeedbackAvailable: process.env.TESTER_FEEDBACK_ENABLED === 'true' && Boolean(user?.isTester),
      demoFeedbackAvailable: Boolean(userId) && !internal && await isDemoFeedbackAvailable(),
      lessonPlannerEnabled,
      requestInfo: {
        hints: getHints(request),
        origin: getDomainUrl(request),
        path: new URL(request.url).pathname,
        userPrefs: {
          navState: (navCookie.state as NavState) ?? 'expanded',
          contrastPreference,
        },
      },
      ENV: getEnv(),
      bannerWarning,
      localDevQuickLogin: {
        enabled: localDevQuickLoginEnabled,
      },
      previewAccessGateEnabled: isPreviewDevLoginAccessCodeRequired(),
      previewAccessSeat,
      devPanelUnlockSeatLabel,
      blackboardLtiMockEnabled: isBlackboardLtiMockUiEnabled(),
      devPanelEnabled: isDevPanelRuntimeEnabled(),
      devPanelEnvBadge: devPanelEnvBadge(),
      devPanelBuildFooter: formatDevPanelBuildFooter(getBuildMetadata()),
      impersonation,
      internalImpersonation: internal ? { ...internal, email: user?.email ?? internal.userId } : null,
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
  contrastPreference = 'standard',
}: {
  children: React.ReactNode;
  nonce: string;
  env?: Record<string, string | boolean | undefined>;
  contrastPreference?: ContrastPreference;
}) {
  const internal = useRouteLoaderData<typeof loader>('root')?.internalImpersonation;
  return (
    <html
      lang="en"
      className="h-full overflow-x-hidden"
      data-contrast={contrastPreference === 'high' ? 'high' : undefined}
    >
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
        {typeof __YAWP_DEV_PANEL_BUILD__ !== 'undefined' &&
        __YAWP_DEV_PANEL_BUILD__ ? (
          <script
            nonce={nonce}
            dangerouslySetInnerHTML={{
              __html: devPanelRestoreInlineScript(),
            }}
          />
        ) : null}
      </head>
      <body style={internal ? { paddingTop: '4rem' } : undefined}>
        {internal ? (
          <section aria-label="Active impersonation" className="fixed inset-x-0 top-0 z-[2147483647] flex min-h-16 items-center justify-between gap-4 bg-amber-200 px-4 py-2 text-sm text-amber-950 shadow">
            <div><strong>Impersonating {internal.email}</strong><br />Actions are audited as {internal.actorId}. Organization: {internal.organizationId}.</div>
            <form method="post" action="/auth/internal-impersonation/end">
              <button type="submit" className="whitespace-nowrap rounded border border-amber-900 px-3 py-2 font-semibold">Exit impersonation</button>
            </form>
          </section>
        ) : null}
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
  const contrastPreference = useContrastPreference();

  // Copy/cut provenance for the paste alert. It has to live at the root,
  // not in the /app layout: the document editor is an `app_.documents_.$id`
  // route, which opts out of that layout. Mounted here, a copy made on any
  // page — class detail, an assignment prompt, writing lessons, another
  // document — is recognized when the student later pastes into an editor,
  // instead of reading as an external paste and raising a false alarm.
  useInternalCopyMarker();

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
        } catch {
          // Dev-only window.authenticate helper: network failures need no UI signal.
        }
      };
    }

    createSecureLoginMethod();
  }, []);

  useEffect(() => {
    if (data.ENV.POSTHOG_API_KEY && !data.internalImpersonation) {
      posthog.init(data.ENV.POSTHOG_API_KEY, {
        before_send: sanitizeDemoFeedbackEvent,
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

      const publicLandingPath =
        data.requestInfo.path === '/' ||
        data.requestInfo.path === '/info' ||
        data.requestInfo.path === '/privacy' ||
        data.requestInfo.path === '/terms';
      const shouldIdentifyUser =
        Boolean(data.user?.id) &&
        !(publicLandingPath && !data.devPanelEnabled);
      if (shouldIdentifyUser && data.user?.id) {
        const identifiedUser = data.user;
        posthog.identify(identifiedUser.id, {
          ...(identifiedUser.email ? { email: identifiedUser.email } : {}),
          ...(identifiedUser.username ? { username: identifiedUser.username } : {}),
          name: identifiedUser.name,
          membership_id: identifiedUser.selectedMembership?.id,
          is_admin: identifiedUser.isAdmin,
          is_owner: identifiedUser.selectedMembership?.isOrgOwner,
          ...omit(identifiedUser, ['id', 'email', 'name', 'username']),
        });
      }
    }
  }, [data.ENV.POSTHOG_API_KEY, data.ENV.POSTHOG_HOST, data.user, data.internalImpersonation]);

  const appChildren = (
    <Document
      nonce={nonce}
      env={data.ENV}
      contrastPreference={contrastPreference}
    >
      {data.devPanelEnabled && !data.internalImpersonation ? (
        <DevPanelMount
          envBadge={data.devPanelEnvBadge}
          previewAccessGateEnabled={data.previewAccessGateEnabled}
          previewAccessSeatLabel={data.devPanelUnlockSeatLabel ?? null}
        />
      ) : data.bannerWarning && !data.internalImpersonation ? (
        <LocalDevEnvironmentBar
          bannerWarning={data.bannerWarning}
          localDevQuickLogin={data.localDevQuickLogin}
          previewAccessGateEnabled={data.previewAccessGateEnabled}
          previewAccessSeatLabel={data.previewAccessSeat?.label ?? null}
          blackboardLtiMockEnabled={data.blackboardLtiMockEnabled}
        />
      ) : null}
      <GlobalLoading />
      <div
        data-yawp-app-shell
        data-feedback-content-frame
        className="flex h-screen min-h-screen flex-col justify-between"
      >
        <div className="flex-1 bg-background">
          <Outlet />
        </div>
      </div>
      {!data.internalImpersonation &&
      data.testerFeedbackAvailable &&
      !data.demoFeedbackAvailable ? (
        <TesterFeedbackWidget />
      ) : null}
      {!data.devPanelEnabled && data.demoFeedbackAvailable ? (
        <DemoFeedbackWidget
          analytics={
            data.ENV.POSTHOG_API_KEY && !data.internalImpersonation
              ? posthog
              : undefined
          }
        />
      ) : null}
      <Toaster toast={data.toast} />
    </Document>
  );

  // Only mount PostHogProvider when an API key is configured to avoid warnings
  if (data.ENV.POSTHOG_API_KEY && !data.internalImpersonation) {
    return (
      <PostHogProvider
        apiKey={data.ENV.POSTHOG_API_KEY}
        options={{
          before_send: sanitizeDemoFeedbackEvent,
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
