import { conform, useForm } from '@conform-to/react'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { Form, Link, Outlet, useLoaderData } from '@remix-run/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { FormInput } from '#app/components/forms/form-input'
import { MagnifyingGlassIcon, PlusIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { requireUserWithRole } from '#app/utils/permissions'

const LoaderFormSchema = z.object({ q: z.string().optional() })
type LoaderFormSchema = z.infer<typeof LoaderFormSchema>

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, ['admin'])

	const url = new URL(request.url)
	const query = url.searchParams.get('q')

	const teachers = await prisma.user.findMany({
		where: {
			teacherProfile: { isNot: null },
			roles: { some: { name: 'teacher' } },
			...(query ? { name: { contains: query } } : {}),
		},
	})

	return json({ teachers })
}

export default function Route() {
	const { teachers } = useLoaderData<typeof loader>()
	const [loaderForm, loaderFields] = useForm<LoaderFormSchema>()

	return (
		<main className="h-full w-full overflow-y-scroll p-6">
			<h2>Teachers</h2>
			<p className="mt-1 max-w-[550px] text-muted-foreground">
				Add, edit, or remove teachers. Teachers can be assigned students,
				allowing them to comment on student's writing and view their module
				progress.
			</p>
			<div className="mt-4 h-[calc(100vh-205px)] min-h-[500px] w-full rounded-sm border">
				<div className="flex h-full w-1/2 flex-col gap-1 border-r">
					<div className="flex items-center justify-between p-3">
						<Form {...loaderForm.props}>
							<div className="relative">
								<MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-3.5 h-5 w-5" />
								<FormInput
									inputProps={{
										...conform.input(loaderFields.q),
										placeholder: 'Search',
										className: 'pl-9',
									}}
								/>
								<input type="submit" hidden />
							</div>
						</Form>
						<Link to="/app/settings/teachers/new">
							<Button size="icon" variant="outline">
								<PlusIcon />
							</Button>
						</Link>
					</div>
					{teachers.length > 0 ? (
						teachers.map(teacher => (
							<div key={teacher.id}>
								{teacher.name} {teacher.email}
							</div>
						))
					) : (
						<div className="flex h-full w-full flex-col items-center justify-center text-center text-muted-foreground">
							<h3>No teachers found.</h3>
							<p>
								Hit the <code className="bg-foreground/10 px-1">+</code> button
								above to create one.
							</p>
						</div>
					)}
				</div>
				<div className="w-1/2">
					<Outlet />
				</div>
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
