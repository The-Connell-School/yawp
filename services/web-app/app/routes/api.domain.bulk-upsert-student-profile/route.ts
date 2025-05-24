
import { data as dataResponse, type ActionFunctionArgs } from 'react-router'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '~/utils/db.server'
import { requireUserWithRole } from '~/utils/permissions.ts'

const StudentProfileSchema = z.array(
	z.object({
		email: z.string().email(),
		name: z.string().optional(),
		workshopLeaderId: z.string().min(1, 'Workshop leader is required'),
		school: z.string().optional(),
		grade: z.string().optional(),
		period: z.string().optional(),
		userPassword: z.string().optional(),
	}),
)

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, 'admin')

	const jsonData = await request.json()
	const result = StudentProfileSchema.safeParse(jsonData)

	if (!result.success) {
		return dataResponse({ error: result.error.format() }, { status: 400 })
	}

	const profiles = []
	for (const {
		email,
		name,
		workshopLeaderId,
		school,
		grade,
		period,
		userPassword,
	} of result.data) {
		const existingUser = await prisma.user.findUnique({
			where: { email },
			include: { studentProfile: true },
		})

		if (!existingUser) {
			// Create new user and student profile
			const newUser = await prisma.user.create({
				data: {
					email,
					name,
					password: {
						create: { hash: bcrypt.hashSync(userPassword || email, 10) },
					},
					studentProfile: {
						create: {
							workshopLeaderId,
							school,
							grade,
							period,
						},
					},
				},
				include: {
					studentProfile: true,
				},
			})
			profiles.push(newUser.studentProfile)
		} else {
			if (userPassword) {
				await prisma.password.update({
					where: { userId: existingUser.id },
					data: { hash: bcrypt.hashSync(userPassword, 10) },
				})
			}

			const updatedProfile = await prisma.studentProfile.upsert({
				where: { userId: existingUser.id },
				update: { workshopLeaderId, school, grade, period },
				create: {
					school,
					grade,
					period,
					workshopLeader: { connect: { id: workshopLeaderId } },
					user: { connect: { id: existingUser.id } },
				},
			})
			profiles.push(updatedProfile)
		}
	}

	return dataResponse({ profiles })
}
