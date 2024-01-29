import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { requireUserWithRole } from '#app/utils/permissions'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, ['admin'])
	return json({})
}

export default function StudentsPage() {
	return (
		<main className="p-6">
			<h2 className="mt-12 text-center">Coming soon.</h2>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
