import { json, type ActionFunctionArgs } from '@remix-run/node'
import { getSessionExpirationDate, sessionKey } from '#app/utils/auth.server.js'
import { prisma } from '#app/utils/db.server.js'
import { authSessionStorage } from '#app/utils/session.server.js'

export async function action({ request }: ActionFunctionArgs) {
	const formData = await request.formData()
	const userId = formData.get('userId')
	const secretToken = formData.get('secretToken')

	if (typeof userId !== 'string' || typeof secretToken !== 'string') {
		return json({ error: 'Invalid input' }, { status: 400 })
	}

	if (secretToken !== process.env.INTERNAL_COMMAND_TOKEN) {
		return json({ error: 'Invalid secret token' }, { status: 401 })
	}

	try {
		const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
		const session = await prisma.session.create({
			select: { id: true, expirationDate: true, userId: true },
			data: {
				expirationDate: getSessionExpirationDate(),
				userId: user.id,
			},
		})

		const authSession = await authSessionStorage.getSession(
			request.headers.get('cookie'),
		)
		authSession.set(sessionKey, session.id)

		return new Response(null, {
			headers: {
				'set-cookie': await authSessionStorage.commitSession(authSession, {
					expires: session.expirationDate,
				}),
			},
		})
	} catch (error) {
		return json({ error: 'Authentication failed' }, { status: 401 })
	}
}
