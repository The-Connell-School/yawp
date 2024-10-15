import { expect, test } from '#tests/playwright-utils.ts'

test('Users can create a document', async ({ page, login, createCourse }) => {
	await createCourse()
	await login()
	await page.goto(`/app/`)

	await page.locator('h4:text("Critical Essay")').first().click()

	await page.getByRole('button', { name: /New/ }).click()

	// Target the TipTap editor more specifically
	const editor = page.locator('.tiptap.ProseMirror[contenteditable="true"]')

	// Focus the editor and type
	await editor.click()
	await editor.type('This is a test document.')
	await page.waitForTimeout(2000)
	await page.getByRole('link', { name: /Exit/ }).click()

	await expect(
		page.locator('p:has-text("This is a test document.")'),
	).toBeVisible()
})
