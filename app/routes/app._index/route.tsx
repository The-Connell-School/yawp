import { GeneralErrorBoundary } from '#app/components/error-boundary'

export default function Route() {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center">
			<h1 className="text-4xl font-bold">Welcome to your new app!</h1>
			<p className="mt-4 text-lg">
				To get started, edit{' '}
				<code className="rounded-md bg-primary-foreground px-2 py-1 font-mono text-sm text-primary">
					app/routes/app._index/route.tsx
				</code>{' '}
				and save to reload.
			</p>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
