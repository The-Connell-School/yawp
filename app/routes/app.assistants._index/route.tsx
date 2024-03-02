import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { ArrowLeftIcon } from '#app/components/icons'
import { useUser } from '#app/hooks/useUser'

export default function Route() {
	const user = useUser()

	return (
		<main className="ml-[10%] mt-32 p-2">
			<div className="mb-8 w-24 border-t-2" />
			<h1 className="mb-8">
				Welcome, <br />
				{user.name}
			</h1>
			<div className="mt-12 flex items-center gap-4">
				<ArrowLeftIcon />
				<p>
					{' '}
					Select an <strong>Assistant</strong> to the left to get started.
				</p>
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
