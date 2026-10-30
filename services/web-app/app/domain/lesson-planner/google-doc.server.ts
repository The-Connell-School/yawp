/**
 * The Google Docs buttons (Oct 24 handoff, task 3): the lesson plan or the
 * student handouts, made a Google Doc in the teacher's Drive and opened.
 * The first click asks Google for drive.file once; after that it is one
 * click to the doc.
 */
import { createCookie, redirect } from 'react-router';
import { randomBytes } from 'node:crypto';
import { prisma } from '~/utils/db.server';
import { shouldUseSecureCookies } from '~/utils/cookie-security.server';
import { signonRequestOrigin } from '~/domain/unified-signon/origin.server';
import { getLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { getLessonPlannerReviewFlags } from '~/domain/feature-flags/feature-flags.server';
import { loadLessonPlan } from './load-lesson-plan-doc.server';
import { renderKitPlanDocx } from './kit-plan-render.server';
import { lessonPlanFilename, renderLessonPlanDocx } from './lesson-plan-render.server';
import { loadHandoutParts } from './load-step-handouts.server';
import { renderHandoutDocx } from './handout-docx.server';
import {
  DRIVE_FILE_SCOPE,
  driveAuthUrl,
  exchangeDriveCode,
  googleDocsReady,
  openToken,
  refreshDriveAccess,
  sealToken,
  uploadAsGoogleDoc,
} from './google-drive.server';

export type GoogleDocKind = 'plan' | 'handouts';
export type GoogleDocProblem = 'unconfigured' | 'declined' | 'failed';

const CALLBACK_PATH = '/app/lesson-planner/google/callback';

const driveCookie = createCookie('yawp-google-drive', {
  path: '/app/lesson-planner',
  httpOnly: true,
  secure: shouldUseSecureCookies(),
  sameSite: 'lax',
  maxAge: 600,
  secrets: (process.env.SESSION_SECRET ?? 'dev').split(','),
});

type Pending = { state: string; returnTo: string };

function isOurs(path: unknown): path is string {
  return typeof path === 'string' && /^\/app\/lesson-planner\/[\w-]+\/google-doc\?doc=(plan|handouts)(&[\w=%,.-]*)?$/.test(path);
}

async function docxFor(request: Request, conversationId: string, kind: GoogleDocKind): Promise<{ name: string; docx: Uint8Array }> {
  if (kind === 'handouts') {
    const { handouts, parts } = await loadHandoutParts({ request, conversationId });
    const docx = await renderHandoutDocx({ title: handouts.title, className: handouts.className, parts });
    const name = parts.length === 1 ? `${handouts.title} - ${parts[0]!.title}` : `${handouts.title} - Student handouts`;
    return { name, docx: new Uint8Array(docx) };
  }
  const { doc, kit } = await loadLessonPlan({ request, conversationId });
  const docx = kit ? await renderKitPlanDocx(kit) : await renderLessonPlanDocx(doc);
  return { name: lessonPlanFilename(kit?.title ?? doc.title, 'docx').replace(/\.docx$/, ''), docx: new Uint8Array(docx) };
}

/** Opens the doc, or asks Google first; otherwise says what went wrong. */
export async function openGoogleDoc({
  request,
  conversationId,
  kind,
}: {
  request: Request;
  conversationId: string;
  kind: GoogleDocKind;
}): Promise<{ problem: GoogleDocProblem }> {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) throw redirect('/app');
  const flags = await getLessonPlannerReviewFlags(access.membership.organization.id);
  if (!flags.teachNotes) throw new Response('Not Found', { status: 404 });
  const owned = await prisma.lessonPlanConversation.findFirst({
    where: { id: conversationId, membershipId: access.membership.id, deletedAt: null },
    select: { id: true },
  });
  if (!owned) throw new Response('Not Found', { status: 404 });

  const origin = signonRequestOrigin(request);
  if (!googleDocsReady(origin)) return { problem: 'unconfigured' };

  const grant = await prisma.googleDriveGrant.findUnique({ where: { userId: access.userId } });
  const refreshToken = grant ? openToken(grant.refreshToken) : null;
  const accessToken = refreshToken ? await refreshDriveAccess(refreshToken) : null;
  if (!accessToken) {
    const url = new URL(request.url);
    const state = randomBytes(24).toString('base64url');
    const pending: Pending = { state, returnTo: `${url.pathname}${url.search}` };
    const user = await prisma.user.findUnique({ where: { id: access.userId }, select: { email: true } });
    throw redirect(driveAuthUrl({ callback: new URL(CALLBACK_PATH, origin).toString(), state, email: user?.email }), {
      headers: { 'Set-Cookie': await driveCookie.serialize(pending) },
    });
  }

  const { name, docx } = await docxFor(request, conversationId, kind);
  const link = await uploadAsGoogleDoc({ accessToken, name, docx });
  if (!link) return { problem: 'failed' };
  throw redirect(link);
}

/** Google's answer to the ask: keep the permission, then make the doc. */
export async function finishDriveGrant(request: Request): Promise<Response> {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) return redirect('/app');
  const pending = (await driveCookie.parse(request.headers.get('cookie'))) as Pending | null;
  const clear = { headers: { 'Set-Cookie': await driveCookie.serialize('', { maxAge: 0 }) } };
  const params = new URL(request.url).searchParams;
  if (!pending || !isOurs(pending.returnTo) || params.get('state') !== pending.state) {
    return redirect('/app/lesson-planner', clear);
  }
  const back = (problem: GoogleDocProblem) => redirect(`${pending.returnTo}&problem=${problem}`, clear);
  const code = params.get('code');
  if (!code) return back('declined');
  const exchanged = await exchangeDriveCode({
    code,
    callback: new URL(CALLBACK_PATH, signonRequestOrigin(request)).toString(),
  });
  if (!exchanged?.refreshToken || !exchanged.scope.split(' ').includes(DRIVE_FILE_SCOPE)) return back('declined');
  const sealed = sealToken(exchanged.refreshToken);
  await prisma.googleDriveGrant.upsert({
    where: { userId: access.userId },
    create: { userId: access.userId, refreshToken: sealed, scope: exchanged.scope },
    update: { refreshToken: sealed, scope: exchanged.scope },
  });
  return redirect(pending.returnTo, clear);
}
