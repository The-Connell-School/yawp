import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { requireUserId } from '#app/utils/auth.server'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserId(request)
	return json({})
}

export default function Route() {
	return (
		<main className="p-6">
			<h2 className="mt-12 text-center">Coming soon.</h2>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
