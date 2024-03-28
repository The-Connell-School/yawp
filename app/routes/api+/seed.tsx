import { type LoaderFunctionArgs, redirect } from '@remix-run/node'
import { prisma } from '../../utils/db.server'
import { production, staging } from './seed.server'

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

	const data = mode === 'staging' ? await staging() : await production()
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
