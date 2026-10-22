import {
  data as dataResponse,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import {
  getOrganizationTableCookie,
  getOrganizationTableCookieValue,
  type OrganizationTableCookie,
  setOrganizationTableCookie,
} from '~/utils/cookies.server';
import { prisma } from '~/utils/db.server';
import {
  createRuntimePreviewSeat,
  getPreviewMasterAccessCode,
  isIsolatedPreviewSeatMode,
} from './preview-seat.server';

export async function organizationsLoader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const previewSeatMode = isIsolatedPreviewSeatMode();
  const previewSeats = previewSeatMode
    ? await prisma.organization.findMany({
        where: { previewSeatCode: { not: null } },
        select: { id: true, name: true, previewSeatCode: true },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  return dataResponse({
    previewSeatMode,
    previewSeats,
    readSurfaceMoved: true,
  });
}

export async function organizationsAction({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'create') {
    return dataResponse(
      { error: 'Organization creation has moved to Yawp! Internal.' },
      { status: 410 }
    );
  }

  if (intent === 'legacy-create') {
    return dataResponse(
      { error: 'Organization creation has moved to Yawp! Internal.' },
      { status: 410 }
    );
  }

  if (intent === 'createPreviewSeat') {
    if (!isIsolatedPreviewSeatMode()) {
      return new Response('Not found', { status: 404 });
    }
    const masterCode = getPreviewMasterAccessCode();
    if (!masterCode) {
      return dataResponse(
        { error: 'Preview access is not configured.' },
        { status: 503 }
      );
    }
    const previewSeat = await createRuntimePreviewSeat(prisma, {
      reservedCodes: [masterCode],
    });
    return dataResponse({ success: true, previewSeat });
  }

  if (intent === 'updateFilters') {
    let filters = await getOrganizationTableCookie(request);
    const key = formData.get('key') as
      | keyof OrganizationTableCookie
      | 'skip-take'
      | 'reset';
    const value = formData.get('value') as string;

    if (key === 'sort') {
      const [field, direction] = value.split('-');
      filters.sort = field as 'name' | 'createdAt';
      filters.direction = direction as 'asc' | 'desc';
    } else if (key === 'skip-take') {
      const [skip, take] = value.split('-');
      filters.skip = Number(skip);
      filters.take = Number(take);
    } else if (key === 'reset') {
      filters = JSON.parse(value) as OrganizationTableCookie;
    } else {
      filters[key] = getOrganizationTableCookieValue(key, value) as never;
    }

    const cookie = await setOrganizationTableCookie(request, filters);
    return dataResponse(
      { success: true },
      { headers: { 'Set-Cookie': cookie } }
    );
  }

  return new Response('Method not allowed', { status: 405 });
}
