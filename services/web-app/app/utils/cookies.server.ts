import { type CookieOptions, createCookie } from 'react-router';

export type StudentFilters = {
  query: string;
  school: string[];
  grade: string[];
  period: string[];
  workshopLeader: string[];
  teacher: string[];
  view: 'table' | 'cards';
  sort: 'name' | 'email' | 'school' | 'grade' | 'period' | 'createdAt';
  direction: 'asc' | 'desc';
  skip: number;
  take: number;
};

export type SubmittedPapersFilter = 'all' | 'graded' | 'non-graded';

export function getStudentFiltersValue(
  key: keyof StudentFilters,
  value: string
) {
  if (
    key === 'school' ||
    key === 'grade' ||
    key === 'period' ||
    key === 'workshopLeader' ||
    key === 'teacher'
  ) {
    return value.split(',').filter(Boolean);
  }

  if (key === 'skip' || key === 'take') {
    return Number(value);
  }

  return value;
}

export const studentFiltersCookie = createCookie('student-filters', {
  maxAge: 60 * 60 * 24 * 30, // 30 days
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
} as CookieOptions);

export async function getStudentFilters(
  request: Request
): Promise<StudentFilters> {
  const cookie = await studentFiltersCookie.parse(
    request.headers.get('Cookie')
  );
  return (
    cookie ?? {
      school: [],
      grade: [],
      period: [],
      workshopLeader: [],
      teacher: [],
      view: 'table',
      sort: 'name',
      direction: 'asc',
      skip: 0,
      take: 10,
    }
  );
}

export async function setStudentFilters(
  request: Request,
  filters: Partial<StudentFilters>
): Promise<string> {
  const currentFilters = await getStudentFilters(request);
  const mergedFilters = { ...currentFilters, ...filters };
  return await studentFiltersCookie.serialize(mergedFilters);
}

export const submittedPapersFilterCookie = createCookie(
  'submitted-papers-filter',
  {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  } as CookieOptions
);

export async function getSubmittedPapersFilter(
  request: Request
): Promise<SubmittedPapersFilter> {
  const cookie = await submittedPapersFilterCookie.parse(
    request.headers.get('Cookie')
  );
  return cookie ?? 'non-graded';
}

export async function setSubmittedPapersFilter(
  request: Request,
  filter: SubmittedPapersFilter
): Promise<string> {
  return await submittedPapersFilterCookie.serialize(filter);
}

// Organization Filters
export type OrganizationTableKey = 'organization-table';
export type OrganizationTableCookie = {
  sort: 'name' | 'createdAt';
  direction: 'asc' | 'desc';
  skip: number;
  take: number;
};

// Organization Members Filters
export type OrganizationMembersTableKey = 'organization-members-table';
export type OrganizationMembersTableCookie = {
  sort: 'name' | 'email' | 'createdAt';
  direction: 'asc' | 'desc';
  skip: number;
  take: number;
  seat?: string[];
};

export function getOrganizationTableCookieValue(
  key: keyof OrganizationTableCookie,
  value: string
) {
  if (key === 'skip' || key === 'take') {
    return Number(value);
  }

  return value;
}

export function getOrganizationMembersTableCookieValue(
  key: keyof OrganizationMembersTableCookie,
  value: string
) {
  if (key === 'seat') {
    return value.split(',').filter(Boolean);
  }
  if (key === 'skip' || key === 'take') {
    return Number(value);
  }

  return value;
}

export const organizationTableCookie = createCookie('organization-table', {
  maxAge: 60 * 60 * 24 * 30, // 30 days
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
} as CookieOptions);

export async function getOrganizationTableCookie(
  request: Request
): Promise<OrganizationTableCookie> {
  const cookie = await organizationTableCookie.parse(
    request.headers.get('Cookie')
  );
  return (
    cookie ?? {
      sort: 'name',
      direction: 'asc',
      skip: 0,
      take: 10,
    }
  );
}

export async function setOrganizationTableCookie(
  request: Request,
  filters: Partial<OrganizationTableCookie>
): Promise<string> {
  const currentFilters = await getOrganizationTableCookie(request);
  const mergedFilters = { ...currentFilters, ...filters };
  return await organizationTableCookie.serialize(mergedFilters);
}

export const organizationMembersTableCookie = createCookie(
  'organization-members-table',
  {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  } as CookieOptions
);

export async function getOrganizationMembersTableCookie(
  request: Request
): Promise<OrganizationMembersTableCookie> {
  const cookie = await organizationMembersTableCookie.parse(
    request.headers.get('Cookie')
  );
  return (
    cookie ?? {
      sort: 'name',
      direction: 'asc',
      skip: 0,
      take: 10,
      seat: [],
    }
  );
}

export async function setOrganizationMembersTableCookie(
  request: Request,
  filters: Partial<OrganizationMembersTableCookie>
): Promise<string> {
  const currentFilters = await getOrganizationMembersTableCookie(request);
  const mergedFilters = { ...currentFilters, ...filters };
  return await organizationMembersTableCookie.serialize(mergedFilters);
}

// Organization Classes Filters
export type OrganizationClassesTableKey = 'organization-classes-table';
export type OrganizationClassesTableCookie = {
  sort: 'code' | 'schoolYear' | 'grade' | 'period' | 'createdAt';
  direction: 'asc' | 'desc';
  skip: number;
  take: number;
};

export const ORGANIZATION_CLASSES_TABLE_SORT_FIELDS = [
  'code',
  'schoolYear',
  'grade',
  'period',
  'createdAt',
] as const satisfies readonly OrganizationClassesTableCookie['sort'][];

export const ORGANIZATION_CLASSES_TABLE_TAKE_OPTIONS = [
  10, 20, 50, 100,
] as const;

const DEFAULT_ORGANIZATION_CLASSES_TABLE_COOKIE: OrganizationClassesTableCookie =
  {
    sort: 'code',
    direction: 'asc',
    skip: 0,
    take: 10,
  };

function normalizeOrganizationClassesTableTake(take: number) {
  if (!Number.isFinite(take)) {
    return DEFAULT_ORGANIZATION_CLASSES_TABLE_COOKIE.take;
  }
  const floored = Math.max(1, Math.floor(take));
  return (ORGANIZATION_CLASSES_TABLE_TAKE_OPTIONS as readonly number[]).includes(
    floored
  )
    ? floored
    : DEFAULT_ORGANIZATION_CLASSES_TABLE_COOKIE.take;
}

/** Allow-list cookie table controls before they reach Prisma orderBy. */
export function parseOrganizationClassesTableCookie(
  raw: unknown
): OrganizationClassesTableCookie {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_ORGANIZATION_CLASSES_TABLE_COOKIE };
  }
  const record = raw as Record<string, unknown>;
  const sort =
    typeof record.sort === 'string' &&
    (ORGANIZATION_CLASSES_TABLE_SORT_FIELDS as readonly string[]).includes(
      record.sort
    )
      ? (record.sort as OrganizationClassesTableCookie['sort'])
      : 'createdAt';
  const direction: OrganizationClassesTableCookie['direction'] =
    record.direction === 'desc' ? 'desc' : 'asc';
  const skip =
    typeof record.skip === 'number' && Number.isFinite(record.skip)
      ? Math.max(0, Math.floor(record.skip))
      : DEFAULT_ORGANIZATION_CLASSES_TABLE_COOKIE.skip;
  const take =
    typeof record.take === 'number'
      ? normalizeOrganizationClassesTableTake(record.take)
      : DEFAULT_ORGANIZATION_CLASSES_TABLE_COOKIE.take;
  return { sort, direction, skip, take };
}

export function getOrganizationClassesTableCookieValue(
  key: keyof OrganizationClassesTableCookie,
  value: string
) {
  if (key === 'skip' || key === 'take') {
    return Number(value);
  }

  return value;
}

export const organizationClassesTableCookie = createCookie(
  'organization-classes-table',
  {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  } as CookieOptions
);

export async function getOrganizationClassesTableCookie(
  request: Request
): Promise<OrganizationClassesTableCookie> {
  const cookie = await organizationClassesTableCookie.parse(
    request.headers.get('Cookie')
  );
  return parseOrganizationClassesTableCookie(cookie);
}

export async function setOrganizationClassesTableCookie(
  request: Request,
  filters: Partial<OrganizationClassesTableCookie>
): Promise<string> {
  const currentFilters = await getOrganizationClassesTableCookie(request);
  const mergedFilters = parseOrganizationClassesTableCookie({
    ...currentFilters,
    ...filters,
  });
  return await organizationClassesTableCookie.serialize(mergedFilters);
}

// Organization Students Filters
export type OrganizationStudentsTableKey = 'organization-students-table';
export type OrganizationStudentsTableCookie = {
  sort: 'name' | 'email' | 'createdAt';
  direction: 'asc' | 'desc';
  skip: number;
  take: number;
};

export function getOrganizationStudentsTableCookieValue(
  key: keyof OrganizationStudentsTableCookie,
  value: string
) {
  if (key === 'skip' || key === 'take') {
    return Number(value);
  }

  return value;
}

export const organizationStudentsTableCookie = createCookie(
  'organization-students-table',
  {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  } as CookieOptions
);

export async function getOrganizationStudentsTableCookie(
  request: Request
): Promise<OrganizationStudentsTableCookie> {
  const cookie = await organizationStudentsTableCookie.parse(
    request.headers.get('Cookie')
  );
  return (
    cookie ?? {
      sort: 'name',
      direction: 'asc',
      skip: 0,
      take: 10,
    }
  );
}

export async function setOrganizationStudentsTableCookie(
  request: Request,
  filters: Partial<OrganizationStudentsTableCookie>
): Promise<string> {
  const currentFilters = await getOrganizationStudentsTableCookie(request);
  const mergedFilters = { ...currentFilters, ...filters };
  return await organizationStudentsTableCookie.serialize(mergedFilters);
}
