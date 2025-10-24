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
  return (
    cookie ?? {
      sort: 'code',
      direction: 'asc',
      skip: 0,
      take: 10,
    }
  );
}

export async function setOrganizationClassesTableCookie(
  request: Request,
  filters: Partial<OrganizationClassesTableCookie>
): Promise<string> {
  const currentFilters = await getOrganizationClassesTableCookie(request);
  const mergedFilters = { ...currentFilters, ...filters };
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
