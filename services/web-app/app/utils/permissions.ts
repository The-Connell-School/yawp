import { data } from 'react-router';
import { type useUser } from '../hooks/useUser.ts';
import { requireUserId } from './auth.server.ts';
import { prisma } from './db.server.ts';

export async function requireAdmin(request: Request) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findFirst({
    select: { id: true, isAdmin: true },
    where: { id: userId, isAdmin: true },
  });

  if (!user) {
    throw data(
      {
        error: 'Unauthorized',
        requiredRole: name,
        message: `Unauthorized: required role: ${name}`,
      },
      { status: 403 }
    );
  }

  return user;
}

export async function requireOwner(request: Request) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findFirst({
    select: {
      id: true,
      isOwner: true,
      organization: { select: { name: true, id: true } },
    },
    where: { id: userId, isOwner: true, organizationId: { not: null } },
  });

  if (!user) {
    throw data(
      {
        error: 'Unauthorized',
        requiredRole: 'owner',
        message: 'Unauthorized: required role: owner',
      },
      { status: 403 }
    );
  }

  return user;
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
