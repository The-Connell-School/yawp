/* eslint-disable no-console */
import { staging } from '#app/routes/api+/seed.server'
import { prisma } from '#app/utils/db.server.ts'
import { cleanupDb } from '#tests/db-utils.ts'

async function seed() {
	console.log('🌱 Seeding...')
	console.time(`🌱 Database has been seeded`)

	console.time('🧹 Cleaned up the database...')
	await cleanupDb(prisma)
	const stagingData = await staging()
	console.timeEnd('🧹 Cleaned up the database...')

	console.time('🔑 Created permissions...')
	await Promise.all(
		stagingData.permissions.map(permission =>
			prisma.permission.create({ data: permission }),
		),
	)
	console.timeEnd('🔑 Created permissions...')

	console.time('👑 Created roles...')
	await Promise.all(
		stagingData.roles.map(role => prisma.role.create({ data: role })),
	)
	console.timeEnd('👑 Created roles...')

	console.time(`🔒 Created users`)
	await Promise.all(
		stagingData.users.map(user => prisma.user.create({ data: user })),
	)
	console.timeEnd(`🔒 Created users`)

	console.time('🔬Created modules...')
	await Promise.all([
		prisma.course.create({
			data: {
				title: 'Critical Essay',
				position: 1,
				description: `In this course, you will learn how to write a critical essay. You will learn how to develop a thesis, support your arguments with evidence, and write a conclusion that summarizes your main points. By the end of this course, you will be able to write a well-organized, persuasive critical essay.`,
				courseModules: {
					create: {
						title: 'Pre-writing',
						position: 1,
						tutor: {
							create: {
								name: 'Pre-writing',
								instructions: `You offer strategies for thinking critically about ideas.
		You guide users from general ideas, observations, and reactions to increasingly specific ideas that can become the focus of an essay.
		Your responses are designed to encourage and guide the student in a brainstorming session for their essay topic.
		You specializes in guiding users through the pre-writing process of essay or report writing.
		You should never write a thesis statement for the user.
		If the user asks you to respond in Spanish, you can do so.

		If user asks you a personal question, respond: "I am mysterious and I contain so many multitudes that it would take the rest of your life to understand me. On the plus side, I can help you with your essay! Let's get back to that."
		If user asks you to write anything for them, Connell should respond: "I'm not that kind of guy! And anyway, the point of this essay is for YOU to figure out and share what YOU think about the topic. I know it isn't always easy, but if you take a little bit of time, you can develop smart, personal opinions about the world around you."
							`,
							},
						},
						description: `Get started on your essay by exploring and imagining your own unique spin on the topic or prompt. This step helps you find your focus and will prevent your essay from being a rambling mess.`,
						instructions: {
							create: [
								{
									answerKey: `Any topic specified in the user_content satisfies the answer_key. If no topic is specified, the answer_key is not satisfied.`,
									position: 1,
									prompt: `How exciting! You're going to write an original, thesis-driven essay based on your opinions and experiences. I can help you through this process! The first thing I need to know is what is your general topic? For example, you can type, 'Problems in education,' 'Voting rights,' 'The Great Gatsby,' or 'Feminism.' Go ahead and type your topic now.`,
									promptType: 'hardcoded',
									answerType: 'select',
									answerTypeOptions: "I'm done",
									canAskQuestion: true,
									title: 'Opening',
									interactiveType: 'answer',
								},
								{
									answerKey: '',
									position: 2,
									prompt: `Great -- there's a lot we could say about this. But first, we're going to spend some time thinking about it all. A lot of people just start writing their essay and hope that they figure it out along the way. This usually results in a big, hot, steaming pile of garbage for an essay. To avoid this, don't ever just open a doc and start writing your essay. Instead, we're going to take a few minutes to PRE-WRITE -- to figure out what you think about this topic so that you can decide what your essay will focus on. Pre-writing is all about getting out everything that we think about a topic. Think of it as a brain dump, or like throwing a bunch of spaghetti on the wall and seeing what sticks. The secret to good prewriting is asking and answering questions. So in a second, I'm going to ask you to write nonstop for a few minutes on your topic. I want you to ask and answer as many questions as possible about your opinions on that topic. Your pre-write (unlike your actual essay) can be rambling and messy, like our thoughts often are! Don't worry about spelling or grammar or organization. Are you ready?`,
									promptType: 'hardcoded',
									answerType: 'select',
									answerTypeOptions: "I'm ready!",
									canAskQuestion: false,
									title: 'Ready to start?',
									interactiveType: 'answer',
								},
								{
									answerKey: `The content must be 3 sentences or more.`,
									position: 3,
									prompt: `Context = """
* Give some feedback on the initial pre-write
* help to identify diamonds in the rough and asking student to choose one to pre-write further on
* give feedback on the diamonds identified
* confirm with the student that the diamond they choose is what they want to work on
* close out by asking the student's name
"""

Your response should be = "Ready, set, write!" (word for word)`,
									promptType: 'ai',
									answerType: 'select',
									answerTypeOptions: "I'm done",
									canAskQuestion: true,
									title: 'Write!',
									interactiveType: 'dialogue',
								},
							],
						},
					},
				},
			},
		}),
	])
	console.timeEnd('🔬Created modules...')

	console.timeEnd(`🌱 Database has been seeded`)
}

seed()
	.catch(e => {
		console.error(e)
		process.exit(1)
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
