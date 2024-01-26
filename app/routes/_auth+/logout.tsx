import { type LoaderFunctionArgs } from '@remix-run/node'
import { logout } from '#app/utils/auth.server.ts'

export async function loader({ request }: LoaderFunctionArgs) {
	return logout({ request, redirectTo: '/login' })
}
