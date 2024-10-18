import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, useSearchParams } from '@remix-run/react'
import { DocumentLink } from '#app/components/document-link.tsx'
import { SearchInput } from '#app/components/search-input'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from '#app/components/ui/sheet'
import {
	Table,
	TableHeader,
	TableBody,
	TableHead,
	TableRow,
	TableCell,
} from '#app/components/ui/table'
import { prisma } from '#app/utils/db.server'

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	const query = url.searchParams.get('q') ?? ''
	const page = parseInt(url.searchParams.get('page') ?? '1')
	const take = parseInt(url.searchParams.get('take') ?? '10')
	const skip = (page - 1) * take
	const selectedStudentId = url.searchParams.get('id')

	const [students, totalCount, selectedStudent] = await Promise.all([
		prisma.studentProfile.findMany({
			where: {
				OR: [
					{ user: { name: { contains: query } } },
					{ user: { email: { contains: query } } },
				],
			},
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
			take,
			skip,
			orderBy: { user: { name: 'asc' } },
		}),
		prisma.studentProfile.count({
			where: {
				OR: [{ user: { name: { contains: query } } }],
			},
		}),
		selectedStudentId
			? prisma.studentProfile.findUnique({
					where: { id: selectedStudentId },
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
			: null,
	])

	const totalPages = Math.ceil(totalCount / take)

	return json({ students, totalPages, currentPage: page, selectedStudent })
}

export default function StudentsRoute() {
	const [_, setSearchParams] = useSearchParams()
	const { students, totalPages, currentPage, selectedStudent } =
		useLoaderData<typeof loader>()

	return (
		<div className="p-4">
			<h1 className="mb-4 text-2xl font-bold">Students</h1>
			<div className="mb-4">
				<SearchInput />
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Email</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{students.map(student => (
						<TableRow
							key={student.id}
							onClick={() => {
								setSearchParams(prev => {
									prev.set('id', student.id)
									return prev
								})
							}}
							className="cursor-pointer hover:bg-muted/50"
						>
							<TableCell>{student.user.name}</TableCell>
							<TableCell>{student.user.email}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			<div className="mt-4 flex justify-between">
				<button
					onClick={() => {
						const newPage = Math.max(1, currentPage - 1)
						setSearchParams(prev => {
							prev.set('page', newPage.toString())
							return prev
						})
					}}
					disabled={currentPage === 1}
					className="rounded bg-blue-500 px-4 py-2 text-white disabled:bg-gray-300"
				>
					Previous
				</button>
				<span>
					Page {currentPage} of {totalPages}
				</span>
				<button
					onClick={() => {
						const newPage = Math.min(totalPages, currentPage + 1)
						setSearchParams(prev => {
							prev.set('page', newPage.toString())
							return prev
						})
					}}
					disabled={currentPage === totalPages}
					className="rounded bg-blue-500 px-4 py-2 text-white disabled:bg-gray-300"
				>
					Next
				</button>
			</div>

			<Sheet
				open={!!selectedStudent}
				onOpenChange={() => {
					setSearchParams(prev => {
						prev.delete('id')
						return prev
					})
				}}
			>
				<SheetContent includeOverlay={false}>
					<SheetHeader>
						<SheetTitle>{selectedStudent?.user.name}</SheetTitle>
					</SheetHeader>
					<div className="mt-4">
						<p>
							<strong>Email:</strong> {selectedStudent?.user.email}
						</p>
						{/* Add more student information here */}
					</div>
					<div className="mt-8">
						<h3 className="mb-4 text-lg font-semibold">Documents</h3>
						<div className="grid gap-4">
							{selectedStudent?.user.documents.map(doc => (
								<DocumentLink
									key={doc.id}
									doc={doc}
									exitTo={`/app/data/students?id=${selectedStudent?.id}`}
								/>
							))}
						</div>
					</div>
				</SheetContent>
			</Sheet>
		</div>
	)
}
