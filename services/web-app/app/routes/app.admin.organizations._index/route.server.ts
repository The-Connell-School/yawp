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

type Stats = {
  total_organizations: number;
  active_organizations: number;
  total_students: number;
  total_teachers: number;
};

export async function organizationsLoader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);
  const { sort, direction, skip, take } =
    await getOrganizationTableCookie(request);
  const previewSeatMode = isIsolatedPreviewSeatMode();
  const masterCode = previewSeatMode ? getPreviewMasterAccessCode() : null;

  const [organizationRows, totalCount, stats] = await Promise.all([
    prisma.organization.findMany({
      skip,
      take,
      include: {
        memberships: {
          include: {
            user: { select: { id: true } },
          },
        },
      },
      orderBy: {
        [sort ?? 'createdAt']: direction === 'asc' ? 'asc' : 'desc',
      },
    }),
    prisma.organization.count(),
    prisma.$queryRaw<Stats[]>`
      SELECT
        (SELECT COUNT(*) FROM "Organization")::int as total_organizations,
        (SELECT COUNT(*) FROM "Organization" WHERE "createdAt" > NOW() - INTERVAL '30 days')::int as active_organizations,
        (SELECT COUNT(*) FROM "OrgMembership" WHERE role = 'STUDENT')::int as total_students,
        (SELECT COUNT(*) FROM "OrgMembership" WHERE role = 'TEACHER')::int as total_teachers
    `,
  ]);

  const growthData = await prisma.organization.groupBy({
    by: ['createdAt'],
    _count: true,
    orderBy: { createdAt: 'asc' },
  });
  const organizations = organizationRows.map(
    ({ previewSeatCode, ...organization }) => ({
      ...organization,
      previewAccessCode: previewSeatMode
        ? organization.id === 'local-dev-org'
          ? masterCode
          : previewSeatCode
        : null,
    })
  );

  return dataResponse({
    organizations,
    stats: stats[0],
    growthData,
    totalCount,
    table: { sort, direction, skip, take },
    previewSeatMode,
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
