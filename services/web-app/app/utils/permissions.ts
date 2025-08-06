import { data, redirect } from 'react-router';
import { type useUser } from '../hooks/useUser.ts';
import { requireUserId } from './auth.server.ts';
import { prisma } from './db.server.ts';
import { getCurrentUserRole, getCurrentOrganizationId } from './organization.server.ts';

export async function requireAdmin(request: Request) {
  const userId = await requireUserId(request);
  const currentUserRole = await getCurrentUserRole(request);

  if (!currentUserRole?.isAdmin) {
    throw data(
      {
        error: 'Unauthorized',
        requiredRole: 'isAdmin',
        message: 'Unauthorized: required role: isAdmin',
      },
      { status: 403 }
    );
  }

  return {
    id: userId,
    isAdmin: currentUserRole.isAdmin,
    isOwner: currentUserRole.isOwner,
    isSuperOwner: currentUserRole.isSuperOwner,
    organizationId: currentUserRole.organizationId,
    userRole: currentUserRole,
  };
}

export async function requireOwner(request: Request) {
  const userId = await requireUserId(request);
  const currentUserRole = await getCurrentUserRole(request);

  if (!currentUserRole?.isOwner) {
    throw data(
      {
        error: 'Unauthorized',
        requiredRole: 'owner',
        message: 'Unauthorized: required role: owner',
      },
      { status: 403 }
    );
  }

  return {
    id: userId,
    isOwner: currentUserRole.isOwner,
    isSuperOwner: currentUserRole.isSuperOwner,
    organization: currentUserRole.organization,
    userRole: currentUserRole,
  };
}

export async function requireOrganizationAccess(request: Request) {
  const userId = await requireUserId(request);
  const organizationId = await getCurrentOrganizationId(request);
  
  if (!organizationId) {
    throw redirect('/app/access-denied');
  }

  const userRole = await prisma.userRole.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          accessExpiresAt: true,
        },
      },
    },
  });

  if (!userRole) {
    throw data({ error: 'User not found in organization' }, { status: 404 });
  }

  // Check if organization access has expired
  if (
    userRole.organization.accessExpiresAt &&
    new Date() > userRole.organization.accessExpiresAt
  ) {
    throw redirect('/app/access-denied');
  }

  return {
    id: userId,
    isOwner: userRole.isOwner,
    organizationId: userRole.organizationId,
    organization: userRole.organization,
    userRole,
  };
}

type Action = 'create' | 'read' | 'update' | 'delete';
type Entity = 'user';
type Access = 'own' | 'any' | 'own,any' | 'any,own';
type PermissionString = `${Action}:${Entity}` | `${Action}:${Entity}:${Access}`;
function parsePermissionString(permissionString: PermissionString) {
  const [action, entity, access] = permissionString.split(':') as [
    Action,
    Entity,
    Access | undefined,
  ];
  return {
    action,
    entity,
    access: access ? (access.split(',') as Array<Access>) : undefined,
  };
}
