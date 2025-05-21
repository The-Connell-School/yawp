
import { type LoaderFunctionArgs, data, redirect } from 'react-router'
import { Link, useLoaderData } from 'react-router'
import { DocumentLink } from '~/components/document-link.tsx'
import { XIcon } from '~/components/icons.tsx'
import { Button } from '~/components/ui/button.tsx'
import { prisma } from '~/utils/db.server.ts'

export async function loader({ params }: LoaderFunctionArgs) {
	const { id } = params
	const student = await prisma.studentProfile.findUnique({
		where: { id },
		include: {
			user: {
				include: {
					documents: {
						include: {
							courseModuleSessions: {
								include: {
									courseModule: true,
								},
							},
						},
					},
				},
			},
		},
	})

	if (!student) {
		return redirect('/app/students')
	}

	return data({ student })
}

export default function StudentRoute() {
	const { student } = useLoaderData<typeof loader>()

	return (
		<div className="flex h-full w-full max-w-[400px] flex-col border-l bg-muted/30">
			<div className="relative border-b p-4">
				<h2 className="text-xl font-bold">{student.user.name}</h2>
				<p className="text-sm text-muted-foreground">{student.user.email}</p>
				<Button variant="unstyled" className="absolute right-4 top-4" asChild>
					<Link to="/app/students">
						<XIcon className="h-5 w-5" strokeWidth={1.5} />
					</Link>
				</Button>
			</div>
			<div className="flex-1 overflow-y-auto p-4">
				<h3 className="mb-4 text-lg font-semibold">Documents</h3>
				{student?.user.documents.length ? (
					<div className="grid gap-4">
						{student?.user.documents.map(doc => (
							<DocumentLink
								key={doc.id}
								doc={doc}
								exitTo={`/app/students/${student?.id}`}
							/>
						))}
					</div>
				) : (
					<p className="w-full rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
						No documents found
					</p>
				)}
			</div>
		</div>
	)
}
