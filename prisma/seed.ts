/* eslint-disable no-console */
import { staging } from '#app/routes/resources+/seed.server'
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
		prisma.module_.create({
			data: {
				title: 'Pre-writing',
				position: 1,
				tutor: {
					create: {
						name: 'Pre-writing',
						answerInstructions: `You offer strategies for thinking critically about ideas.
You guide users from general ideas, observations, and reactions to increasingly specific ideas that can become the focus of an essay.
Your responses are designed to encourage and guide the student in a brainstorming session for their essay topic.
You specializes in guiding users through the pre-writing process of essay or report writing.
You should never write a thesis statement for the user.
You can translate all instructions to Spanish if requested.

If user asks you a personal question, respond: "I am mysterious and I contain so many multitudes that it would take the rest of your life to understand me. On the plus side, I can help you with your essay! Let's get back to that."
If user asks you to write anything for them, Connell should respond: "I'm not that kind of guy! And anyway, the point of this essay is for YOU to figure out and share what YOU think about the topic. I know it isn't always easy, but if you take a little bit of time, you can develop smart, personal opinions about the world around you."
					`,
						promptInstructions: `You offer strategies for thinking critically about ideas.
You guide users from general ideas, observations, and reactions to increasingly specific ideas that can become the focus of an essay.
Your responses are designed to encourage and guide the student in a brainstorming session for their essay topic.
You specializes in guiding users through the pre-writing process of essay or report writing.
You should never write a thesis statement for the user.
You can translate all instructions to Spanish if requested.
					`,
					},
				},
				description: `Get started on your essay by exploring and imagining your own unique spin on the topic or prompt. This step helps you find your focus and will prevent your essay from being a rambling mess.`,
				instructions: {
					create: [
						{
							answerKey: `Any topic specified in the content satisfies the answer_key.`,
							position: 1,
							prompt: `How exciting! You're going to write an original, thesis-driven essay based on your opinions and experiences. I can help you through this process! The first thing I need to know is what is your general topic? For example, you can type, 'Problems in education,' 'Voting rights,' 'The Great Gatsby,' or 'Feminism.' Go ahead and type your topic now.`,
							promptType: 'hardcoded',
							answerType: 'select',
							answerTypeOptions: "I'm done",
							canAskQuestion: true,
							title: 'Opening',
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
						},
						{
							answerKey: `The content must be 3 sentences or more.`,
							position: 3,
							prompt: `Ready, set, write!`,
							promptType: 'hardcoded',
							answerType: 'select',
							answerTypeOptions: "I'm done",
							canAskQuestion: true,
							title: 'Write!',
						},
						{
							answerKey: `The student should write 3 more sentences in the user_content than the previous message.`,
							position: 4,
							prompt: `Start your response, word for word, with the quote below. Then, analyze the user_content and identifying examples of diamonds that they can explore further. Add it to the end of the quote below. "Great work! The next step in pre-writing is to read over what we've written. A lot of it may not be that interesting—that's ok—many times you have to say a lot of nothing in order to get to the good stuff (this is worth it, because the alternative is just writing the essay and forcing your reader or teacher to read a whole lot of nothing). When you find the good stuff, highlight it or circle it or make note of it. These are the diamonds in the rough -- the great ideas hiding in your pre-write. Now I want you to grab one of those diamonds and pre-write on just that one idea or point. Start asking specific questions about that diamond—flush that out. [Note: if you've written for a while and you don't have anything that's really grabbing you, then go back to the beginning and offer a different answer to what you find interesting or confusing or worthy of discussion. Choose a different road to go down.]"`,
							promptType: 'ai',
							answerType: 'select',
							answerTypeOptions: "I'm done",
							canAskQuestion: true,
							title: 'Identify diamonds in the rough',
						},
						{
							answerKey: `The student should respond with an affirmative (like "yes" or "no"). If yes, the answer_key is satisfied. If no, prompt them to choose a different "diamond in the rough" (a topic in the content that was written) and respond word-for-word with "Ok, let's go back and look at another angle -- find a different 'diamond' from your pre-write."`,
							position: 6,
							prompt: `Begin your message with this word-for-word: "This is a great topic.". Then, talk about why this will make a good essay. End your message with this word-for-word: "Is this the specific topic you want to build a thesis around?"`,
							promptType: 'ai',
							answerType: 'select',
							answerTypeOptions: 'Yes,No',
							canAskQuestion: false,
							title: 'Get topic confirmation',
						},
						{
							answerKey: `The student should respond with their name. For example, "My name is John." or "John." Any name satisfies the answer_key.`,
							position: 7,
							prompt: `Excellent! You've just completed the pre-writing phase. Take a minute to recognize how you started with a very general idea and through the process of Critical Thinking--simply asking and answering questions--you've found a more specific focus. This step of pre-writing alone has already improved your chances of writing a great essay! Now that you have your specific focus, you can move onto developing a thesis statement. Ask your teacher to direct you to Connell Thesis Assistant. By the way, what's your name?`,
							promptType: 'hardcoded',
							answerType: 'textarea',
							concludingPrompt:
								"Get the name of the user from previous content, and respond character for character (filling in the <name>): 'Great work today <name>!'",
							concludingPromptType: 'ai',
							title: 'Concluding',
						},
					],
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
