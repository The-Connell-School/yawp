import { type StudentProfile } from '@prisma/client'
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { type User } from '@sentry/remix'
import { type ColumnDef } from '@tanstack/react-table'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { prisma } from '#app/utils/db.server.ts'
import { requireUserWithRole } from '#app/utils/permissions'

export type Data = User & { studentProfile: StudentProfile }

export const columns: ColumnDef<Data>[] = [
	{
		accessorKey: 'name',
		header: 'Full name',
	},
	{
		accessorKey: 'email',
		header: 'Email',
	},
	{
		accessorKey: 'studentProfile.grade',
		header: 'Grade',
	},
	{
		accessorKey: 'studentProfile.school',
		header: 'School',
	},
]

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRole(request, ['admin', 'teacher'])
	const isAdmin = user?.roles.some(role => role.name === 'admin')

	const students = await prisma.user.findMany({
		include: { studentProfile: { include: { workshopLeader: true } } },
		where: {
			roles: { some: { name: 'student' } },
			studentProfile: { isNot: null },
			...(isAdmin ? {} : { studentProfile: { workshopLeaderId: user.id } }),
		},
	})

	return json({ students })
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
