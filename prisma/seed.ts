import { staging } from '#app/routes/resources+/seed'
import { prisma } from '#app/utils/db.server.ts'
import { cleanupDb } from '#tests/db-utils.ts'

async function seed() {
	console.log('🌱 Seeding...')
	console.time(`🌱 Database has been seeded`)

	console.time('🧹 Cleaned up the database...')
	await cleanupDb(prisma)
	console.timeEnd('🧹 Cleaned up the database...')

	console.time('🔑 Created permissions...')
	await Promise.all(
		staging.permissions.map(permission =>
			prisma.permission.create({ data: permission }),
		),
	)
	console.timeEnd('🔑 Created permissions...')

	console.time('👑 Created roles...')
	await Promise.all(
		staging.roles.map(role => prisma.role.create({ data: role })),
	)
	console.timeEnd('👑 Created roles...')

	console.time(`🔒 Created users`)
	await Promise.all(
		staging.users.map(user => prisma.user.create({ data: user })),
	)
	console.timeEnd(`🔒 Created users`)

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
