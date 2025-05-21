import { type LoaderFunctionArgs, redirect } from 'react-router'
import { prisma } from '../../../utils/db.server'
import { preview } from './seed.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const mode = url.searchParams.get('mode')
	const token = url.searchParams.get('token')

	if (
		!['preview'].includes(mode ?? '') ||
		token !== process.env.INTERNAL_COMMAND_TOKEN
	) {
		return redirect('/')
	}

	const data = await preview()
	const dataExists = await prisma.user.count()

	if (dataExists) {
		return redirect('/', { status: 500 })
	}

	await Promise.all(
		data.permissions.map(permission =>
			prisma.permission.create({ data: permission }),
		),
	)
	await Promise.all(data.roles.map(data => prisma.role.create({ data })))
	await Promise.all(
		data.featureFlags.map(data => prisma.featureFlag.create({ data })),
	)
	await Promise.all(data.users.map(data => prisma.user.create({ data })))
	await Promise.all(
		data.courses.map(course => prisma.course.create({ data: course })),
	)

	return new Response('OK')
}
