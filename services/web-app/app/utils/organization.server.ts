import { prisma } from './db.server.ts';
import { getUserId } from './auth.server.ts';

export const ORGANIZATION_COOKIE_NAME = 'selected-organization-id';

/**
 * Get the current organization ID from cookie or fallback to first organization
 */
export async function getCurrentOrganizationId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get('Cookie');
  const cookies = new Map(
    cookieHeader?.split('; ').map(c => {
      const [name, ...rest] = c.split('=');
      return [name, rest.join('=')];
    }) ?? []
  );
  
  const selectedOrgId = cookies.get(ORGANIZATION_COOKIE_NAME);
  
  if (selectedOrgId) {
    // Verify user has access to this organization
    const userId = await getUserId(request);
    if (userId) {
      const userRole = await prisma.userRole.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId: selectedOrgId,
          },
        },
      });
      
      if (userRole) {
        return selectedOrgId;
      }
    }
  }
  
  // Fallback to first organization user has access to
  const userId = await getUserId(request);
  if (!userId) return null;
  
  const firstUserRole = await prisma.userRole.findFirst({
    where: { userId },
    select: { organizationId: true },
    orderBy: { createdAt: 'asc' },
  });
  
  return firstUserRole?.organizationId ?? null;
}

/**
 * Get user's role within the current organization context
 */
export async function getCurrentUserRole(request: Request, organizationId?: string) {
  const userId = await getUserId(request);
  if (!userId) return null;
  
  const currentOrgId = organizationId ?? await getCurrentOrganizationId(request);
  if (!currentOrgId) return null;
  
  return prisma.userRole.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: currentOrgId,
      },
    },
    include: {
      organization: { select: { id: true, name: true } },
      studentProfile: true,
      teacherProfile: true,
    },
  });
}

/**
 * Get all organizations user has access to
 */
export async function getUserOrganizations(userId: string) {
  return prisma.userRole.findMany({
    where: { userId },
    include: {
      organization: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Create organization selection cookie header
 */
export function createOrganizationCookie(organizationId: string) {
  return `${ORGANIZATION_COOKIE_NAME}=${organizationId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`; // 30 days
}

/**
 * Clear organization selection cookie
 */
export function clearOrganizationCookie() {
  return `${ORGANIZATION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}