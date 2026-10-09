import { prisma } from './db.server';
import { createUserManagementHandlers } from './internal-management.server';

export const internalDirectory = createUserManagementHandlers({
  findMany: args => prisma.orgMembership.findMany({
    ...args,
    select: { id: true, organizationId: true, user: { select: { id: true, name: true, email: true, isAdmin: true, isSuperAdmin: true } } },
  }),
}, () => process.env.YAWP_MANAGEMENT_SERVICE_KEY);

import { createOrganizationManagementHandler } from './internal-organizations.server';
export const internalOrganizationSearch = createOrganizationManagementHandler({
  findMany: args => prisma.organization.findMany({ ...args, select: { id: true, name: true } }),
}, () => process.env.YAWP_MANAGEMENT_SERVICE_KEY);

import { createOrganizationListHandler } from './internal-organizations.server';
export const internalOrganizationList = createOrganizationListHandler({
  findMany: args => prisma.organization.findMany({ ...args, select: { id: true, name: true } }),
}, () => process.env.YAWP_MANAGEMENT_SERVICE_KEY);
