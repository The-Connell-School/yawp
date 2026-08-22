import { randomBytes } from 'node:crypto';
import { COURSE, ROSTER, personaFrom, personaForRole } from './catalog.mjs';
import {
  appPath,
  clearSessionCookie,
  readSession,
  requestPublicBasePath,
  sessionCookie,
} from './session.mjs';
import {
  renderContent,
  renderCourses,
  renderGrades,
  renderSignIn,
} from './learn-ui.mjs';

export function tryLearnRoute(ctx, { handleDevLaunch, send }) {
  const { url, request, response, body, config, store } = ctx;
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  if (pathname.startsWith('/learn/api/')) return null;

  const session = readSession(request.headers.cookie);
  const base = requestPublicBasePath(config, request);

  if (pathname === '/' || pathname === '/learn' || pathname === '/learn/signin' || pathname === '/dev') {
    if (session && pathname !== '/learn/signin') {
      return redirect(response, appPath(base, '/learn/courses'));
    }
    send(response, 200, renderSignIn({ publicBasePath: base }));
    return { status: 200 };
  }

  if (pathname === '/learn/session' && request.method === 'POST') {
    const persona = personaFrom(body.persona);
    if (!persona) {
      send(response, 400, { error: 'unknown persona' });
      return { status: 400 };
    }
    return redirect(
      response,
      appPath(base, '/learn/courses'),
      sessionCookie(persona.role, base)
    );
  }

  if (pathname === '/learn/logout') {
    return redirect(
      response,
      appPath(base, '/learn/signin'),
      clearSessionCookie(base)
    );
  }

  if (!session) {
    if (
      pathname === '/learn/courses' ||
      pathname.startsWith('/learn/courses/')
    ) {
      return redirect(response, appPath(base, '/learn/signin'));
    }
    return null;
  }

  if (pathname === '/learn/courses') {
    send(
      response,
      200,
      renderCourses({ publicBasePath: base, session, course: COURSE })
    );
    return { status: 200 };
  }

  const tools = pathname.match(/^\/learn\/courses\/([^/]+)\/tools\/lti$/);
  if (tools) {
    if (session.role !== 'Instructor') {
      send(response, 403, { error: 'Instructors add teaching tools' });
      return { status: 403 };
    }
    const contextId = decodeURIComponent(tools[1]);
    return handleDevLaunch(
      {
        ...ctx,
        url: launchUrl(url, {
          role: session.role,
          sub: personaForRole(session.role).user.sub,
          context_id: contextId,
          context_label: COURSE.label,
          context_title: COURSE.title,
          message_type: 'LtiDeepLinkingRequest',
          resource_link_title: 'Add teaching tool',
        }),
      },
      ''
    );
  }

  const coursePage = pathname.match(
    /^\/learn\/courses\/([^/]+)(?:\/(content|grades)(?:\/([^/]+))?)?$/
  );
  if (!coursePage) return null;

  const contextId = decodeURIComponent(coursePage[1]);
  const section = coursePage[2] || 'content';
  const itemId = coursePage[3] ? decodeURIComponent(coursePage[3]) : '';
  if (contextId !== COURSE.id) {
    send(response, 404, { error: 'course not found' });
    return { status: 404 };
  }
  const items = store.contentItems.get(contextId) || [];

  if (section === 'content' && itemId) {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) {
      send(response, 404, { error: 'content not found' });
      return { status: 404 };
    }
    // Prefer the Deep Linking-provided URL when available to ensure the Tool
    // launch targets the exact host returned in the signed content item.
    if (item.url) {
      return redirect(response, item.url);
    }
    return handleDevLaunch(
      {
        ...ctx,
        url: launchUrl(url, {
          role: session.role,
          sub: personaForRole(session.role).user.sub,
          context_id: contextId,
          context_label: COURSE.label,
          context_title: COURSE.title,
          resource_link_id: item.id,
          resource_link_title: item.title,
        }),
      },
      ''
    );
  }

  if (section === 'content') {
    send(
      response,
      200,
      renderContent({
        publicBasePath: base,
        session,
        course: COURSE,
        items,
      })
    );
    return { status: 200 };
  }

  if (section === 'grades') {
    send(
      response,
      200,
      renderGrades({
        publicBasePath: base,
        session,
        course: COURSE,
        items,
        roster: ROSTER,
        scores: [...store.scoresCurrent.values()],
      })
    );
    return { status: 200 };
  }

  return redirect(response, appPath(base, `/learn/courses/${contextId}/content`));
}

export function rememberDeepLinkedContent(store, contentItems, contextId = COURSE.id) {
  if (!Array.isArray(contentItems) || contentItems.length === 0) return;
  const current = store.contentItems.get(contextId) || [];
  for (const item of contentItems) {
    const id =
      item.resourceLinkId ||
      item.id ||
      `_dl_${randomBytes(3).toString('hex')}_1`;
    if (current.some((entry) => entry.id === id || entry.title === item.title)) {
      continue;
    }
    current.push({
      id,
      title: item.title || 'Teaching tool',
      type: item.type || 'ltiResourceLink',
      lineItemId: item.lineItem?.resourceId || `${id}_grade`,
      description: item.text || 'Added from a teaching tool',
      url: item.url || '',
    });
  }
  store.contentItems.set(contextId, current);
}

function launchUrl(currentUrl, params) {
  const next = new URL(currentUrl.href);
  for (const [key, value] of Object.entries(params)) {
    if (value) next.searchParams.set(key, value);
  }
  return next;
}

function redirect(response, location, cookie) {
  const headers = { location, 'cache-control': 'no-store' };
  if (cookie) headers['set-cookie'] = cookie;
  response.writeHead(302, headers);
  response.end();
  return { status: 302, detail: { location } };
}
