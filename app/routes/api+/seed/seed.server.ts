import { type Prisma } from '@prisma/client'
import { prisma } from '#app/utils/db.server'
import { createPassword } from '#tests/db-utils'

type SeedData = {
	users: Prisma.UserCreateInput[]
	roles: Prisma.RoleCreateInput[]
	permissions: Prisma.PermissionCreateInput[]
}

export const permissions: SeedData['permissions'] = [
	{ entity: 'user', action: 'update', access: 'own' },
	{ entity: 'user', action: 'read', access: 'own' },
	{ entity: 'user', action: 'create', access: 'any' },
	{ entity: 'user', action: 'update', access: 'any' },
	{ entity: 'user', action: 'read', access: 'any' },
	{ entity: 'user', action: 'delete', access: 'any' },
]

const roles: () => Promise<SeedData['roles']> = async () => [
	{
		name: 'admin',
		permissions: {
			connect: await prisma.permission.findMany({
				select: { id: true },
				where: { access: 'any' },
			}),
		},
	},
	{
		name: 'user',
		permissions: {
			connect: await prisma.permission.findMany({
				select: { id: true },
				where: { access: 'own' },
			}),
		},
	},
]
export const staging: () => Promise<SeedData> = async () => ({
	roles: await roles(),
	permissions,
	users: [
		{
			email: 'brian@theconnellschool.com',
			name: 'Brian Connell',
			password: { create: createPassword('bconnell') },
			roles: { connect: [{ name: 'admin' }] },
			teacherProfile: { create: {} },
		},
		{
			email: 'bryant@brock.software',
			name: 'Bryant Brock',
			password: { create: createPassword('bbrock') },
			roles: { connect: [{ name: 'admin' }] },
		},
		{
			email: 'cpaul@brock.software',
			name: 'Caleb Paul',
			password: { create: createPassword('cpaul') },
			roles: { connect: [{ name: 'admin' }] },
		},
		{
			email: 'jdoe@brock.software',
			name: 'John Doe',
			password: { create: createPassword('jdoe') },
			roles: { connect: [{ name: 'user' }] },
			studentProfile: { create: {} },
		},
		{
			email: 'jsmith@brock.software',
			name: 'Jane Smith',
			password: { create: createPassword('jsmith') },
			roles: { connect: [{ name: 'user' }] },
			studentProfile: { create: {} },
		},
		{
			email: 'arobins@brock.software',
			name: 'Alex Robins',
			password: { create: createPassword('arobins') },
			roles: { connect: [{ name: 'user' }] },
			teacherProfile: { create: {} },
		},
	],
})

export const production: () => Promise<SeedData> = async () => ({
	roles: await roles(),
	permissions,
	users: [
		{
			email: 'brian@theconnellschool.com',
			name: 'Brian Connell',
			password: { create: createPassword('bconnell') },
			teacherProfile: { create: {} },
			roles: { connect: [{ name: 'admin' }] },
		},
	],
})
