import { expect, test } from '#tests/playwright-utils.ts'

test('Admin can bulk upsert student profiles', async ({ page, login }) => {
	await login({ role: 'admin' })

	const testData = [
		{
			email: 'student1@example.com',
			name: 'Student One',
			school: 'Test High School',
			grade: '10',
			period: '3',
			userPassword: 'pass123',
		},
		{
			email: 'student2@example.com',
			name: 'Student Two',
			school: 'Test High School',
			grade: '11',
			period: '4',
			userPassword: 'pass456',
		},
	]

	const response = await page.request.post(
		'/api/domain/bulk-upsert-student-profile',
		{ data: testData },
	)

	expect(response.ok()).toBe(true)

	const result = await response.json()
	expect(result.profiles).toHaveLength(2)

	// Verify first student profile
	expect(result.profiles[0]).toMatchObject({
		school: 'Test High School',
		grade: '10',
		period: '3',
	})

	// Verify second student profile
	expect(result.profiles[1]).toMatchObject({
		school: 'Test High School',
		grade: '11',
		period: '4',
	})
})
