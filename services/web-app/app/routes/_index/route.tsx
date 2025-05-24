import { redirect, type MetaFunction } from 'react-router'
import { DEFAULT_ROUTE } from '~/utils/misc'

export const meta: MetaFunction = () => [{ title: 'Yawp!' }]

export async function loader() {
	return redirect(DEFAULT_ROUTE)
}
