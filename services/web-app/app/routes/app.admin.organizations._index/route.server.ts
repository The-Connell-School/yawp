import { parseFormData, validationError } from '@rvf/react-router';
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
import { CreateOrganizationSchema } from './schema';

export async function organizationsLoader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  return dataResponse({
    previewSeatMode: isIsolatedPreviewSeatMode(),
    readSurfaceMoved: true,
  });
}

export async function organizationsAction({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'create') {
    const { error, data } = await parseFormData(
      formData,
      CreateOrganizationSchema
    );
    if (error) return validationError(error);

    await prisma.organization.create({
      data: {
        name: data.name,
        numOfStudentSeats: Number(data.numOfStudentSeats),
        numOfTeacherSeats: Number(data.numOfTeacherSeats),
        accessExpiresAt: data.accessExpiresAt
          ? new Date(data.accessExpiresAt)
          : null,
      },
    });

    return dataResponse({ success: true });
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
