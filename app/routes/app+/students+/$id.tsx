import { type LoaderFunctionArgs, json, redirect } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { DocumentLink } from '#app/components/document-link.tsx'
import { prisma } from '#app/utils/db.server.ts'

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

	return json({ student })
}

export default function StudentRoute() {
	const { student } = useLoaderData<typeof loader>()

	return (
		<div className="flex h-full w-full max-w-[400px] flex-col border-l bg-background bg-muted/50 p-4">
			<div className="flex flex-col gap-4">
				<div>
					<h2 className="text-xl font-bold">{student.user.name}</h2>
					<p className="text-sm text-muted-foreground">{student.user.email}</p>
				</div>
				<div className="mt-8">
					<h3 className="mb-4 text-lg font-semibold">Documents</h3>
					{student?.user.documents.length ? (
						<div className="grid gap-4">
							{student?.user.documents.map(doc => (
								<DocumentLink
									key={doc.id}
									doc={doc}
									exitTo={`/app/students/${student?.id}`}
									noPreviewBgColor="white"
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
		</div>
	)
}
