import { type Prisma } from '@prisma/client'
import { type LoaderFunctionArgs, redirect } from '@remix-run/node'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword } from '#tests/db-utils'

type SeedData = {
	users: Prisma.UserCreateInput[]
	roles: Prisma.RoleCreateInput[]
	permissions: Prisma.PermissionCreateInput[]
}

const permissions: SeedData['permissions'] = [
	{ entity: 'user', action: 'update', access: 'own' },
	{ entity: 'user', action: 'read', access: 'own' },
	{ entity: 'user', action: 'create', access: 'any' },
	{ entity: 'user', action: 'update', access: 'any' },
	{ entity: 'user', action: 'read', access: 'any' },
	{ entity: 'user', action: 'delete', access: 'any' },
]

const roles: SeedData['roles'] = [
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

export const staging: SeedData = {
	roles,
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
	],
}

export const production: SeedData = {
	roles,
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
}

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const mode = url.searchParams.get('mode')
	const token = url.searchParams.get('token')

	if (
		!['staging', 'production'].includes(mode ?? '') ||
		token !== process.env.INTERNAL_COMMAND_TOKEN
	) {
		return redirect('/')
	}

	const data = mode === 'staging' ? staging : production
	const existing = await prisma.user.count({
		where: { email: data.users[0].email },
	})

	if (existing) {
		return redirect('/')
	}

	await Promise.all(
		data.permissions.map(permission =>
			prisma.permission.create({ data: permission }),
		),
	)
	await Promise.all(data.roles.map(role => prisma.role.create({ data: role })))
	await Promise.all(data.users.map(user => prisma.user.create({ data: user })))

	return new Response('OK')
}
