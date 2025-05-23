/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client'
import { preview } from './fixtures/preview'
import { cleanupDb } from './utils';

const prisma = new PrismaClient()

async function seed() {
	console.log('🌱 Seeding...')
	console.time(`🌱 Database has been seeded`)

	console.time('🧹 Cleaned up the database...')
	try {
		await cleanupDb(prisma)
	} catch (e) {
		console.error(e)
	}
	const data = await preview(prisma)
	console.timeEnd('🧹 Cleaned up the database...')

	console.time('🔑 Created permissions...')
	await Promise.all(
		data.permissions.map(permission =>
			prisma.permission.create({ data: permission }),
		),
	)
	console.timeEnd('🔑 Created permissions...')

	console.time('👑 Created roles...')
	await Promise.all(data.roles.map(data => prisma.role.create({ data })))
	console.timeEnd('👑 Created roles...')

	console.time('🏴‍☠️ Created feature flags...')
	await Promise.all(
		data.featureFlags.map(data => prisma.featureFlag.create({ data })),
	)
	console.timeEnd('🏴‍☠️ Created feature flags...')

	console.time(`🔒 Created users`)
	await Promise.all(data.users.map(data => prisma.user.create({ data })))
	console.timeEnd(`🔒 Created users`)

	console.time('🔬Created modules...')
	await Promise.all(data.courses.map(data => prisma.course.create({ data })))
	console.timeEnd('🔬Created modules...')

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
