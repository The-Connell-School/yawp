import { redirect, type MetaFunction } from '@remix-run/node'
import { DEFAULT_ROUTE } from '#app/utils/misc'

export const meta: MetaFunction = () => [{ title: 'Yawp!' }]

export async function loader() {
	return redirect(DEFAULT_ROUTE)
}
