import { prisma } from '#app/utils/db.server.ts'
import { cleanupDb, createPassword, createUser } from '#tests/db-utils.ts'

async function seed() {
	console.log('🌱 Seeding...')
	console.time(`🌱 Database has been seeded`)

	console.time('🧹 Cleaned up the database...')
	await cleanupDb(prisma)
	console.timeEnd('🧹 Cleaned up the database...')

	console.time('🔑 Created permissions...')
	const entities = ['user']
	const actions = ['create', 'read', 'update', 'delete']
	const accesses = ['own', 'any'] as const
	for (const entity of entities) {
		for (const action of actions) {
			for (const access of accesses) {
				await prisma.permission.create({ data: { entity, action, access } })
			}
		}
	}
	console.timeEnd('🔑 Created permissions...')

	console.time('👑 Created roles...')
	await prisma.role.create({
		data: {
			name: 'admin',
			permissions: {
				connect: await prisma.permission.findMany({
					select: { id: true },
					where: { access: 'any' },
				}),
			},
		},
	})
	await prisma.role.create({
		data: {
			name: 'teacher',
			permissions: {
				connect: await prisma.permission.findMany({
					select: { id: true },
					where: { access: 'own' },
				}),
			},
		},
	})
	await prisma.role.create({
		data: {
			name: 'student',
			permissions: {
				connect: await prisma.permission.findMany({
					select: { id: true },
					where: { access: 'own' },
				}),
			},
		},
	})
	console.timeEnd('👑 Created roles...')

	console.time(`🔒 Created admin users`)

	await Promise.all([
		prisma.user.create({
			select: { id: true },
			data: {
				email: 'admin@example.com',
				name: 'Joe Brown',
				password: {
					create: createPassword('jbrown'),
				},
				roles: { connect: [{ name: 'admin' }, { name: 'teacher' }] },
			},
		}),
	])

	console.timeEnd(`🔒 Created admin users`)

	console.time(`👩🏼‍🏫 Created teacher users`)
	const totalUsers = 2

	for (let index = 0; index < totalUsers; index++) {
		const userData = createUser()
		await prisma.user
			.create({
				select: { id: true },
				data: {
					...userData,
					password: { create: createPassword(userData.email) },
					roles: { connect: { name: 'teacher' } },
				},
			})
			.catch(e => {
				console.error('Error creating a teacher:', e)
				return null
			})
	}
	console.timeEnd(`👩🏼‍🏫 Created teacher users`)

	console.timeEnd(`🌱 Database has been seeded`)
}

seed()
	.catch(e => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
