/* eslint-disable no-console */
import { staging } from '#app/routes/resources+/seed'
import { prisma } from '#app/utils/db.server.ts'
import { cleanupDb } from '#tests/db-utils.ts'

async function seed() {
	console.log('🌱 Seeding...')
	console.time(`🌱 Database has been seeded`)

	console.time('🧹 Cleaned up the database...')
	await cleanupDb(prisma)
	console.timeEnd('🧹 Cleaned up the database...')

	console.time('🔑 Created permissions...')
	await Promise.all(
		staging.permissions.map(permission =>
			prisma.permission.create({ data: permission }),
		),
	)
	console.timeEnd('🔑 Created permissions...')

	console.time('👑 Created roles...')
	await Promise.all(
		staging.roles.map(role => prisma.role.create({ data: role })),
	)
	console.timeEnd('👑 Created roles...')

	console.time(`🔒 Created users`)
	await Promise.all(
		staging.users.map(user => prisma.user.create({ data: user })),
	)
	console.timeEnd(`🔒 Created users`)

	console.time('🔬Created modules...')
	await Promise.all([
		prisma.module_.create({
			data: {
				title: 'Pre-writing',
				position: 1,
				description: `Learn to brain-dump. We get you to start dreaming and writing about your favorite topics before moving on to forming a thesis. This is the fun part.`,
				instructions: {
					create: [
						{
							answerKey:
								'The student must have written some content. For example, "Problems in education," "Voting rights," "The Great Gatsby," or "Feminism." Any amount of content is correct, it doesn\'t have to be a complete sentence or one of the examples.',
							position: 1,
							prompt: `How exciting! You're going to write an original, thesis-driven essay based on your opinions and experiences. I can help you through this process! The first thing I need to know is what is your general topic? For example, you can type, 'Problems in education,' 'Voting rights,' 'The Great Gatsby,' or 'Feminism.' Go ahead and type your topic now.`,
							promptType: 'hardcoded',
							answerType: 'select',
							answerTypeOptions: "I'm done",
						},
						{
							answerKey: '',
							position: 2,
							prompt: `Great -- there's a lot we could say about this. But first, we're going to spend some time thinking about it all. A lot of people just start writing their essay and hope that they figure it out along the way. This usually results in a big, hot, steaming pile of garbage for an essay. To avoid this, don't ever just open a doc and start writing your essay. Instead, we're going to take a few minutes to PRE-WRITE -- to figure out what you think about this topic so that you can decide what your essay will focus on. Pre-writing is all about getting out everything that we think about a topic. Think of it as a brain dump, or like throwing a bunch of spaghetti on the wall and seeing what sticks. The secret to good prewriting is asking and answering questions. So in a second, I'm going to ask you to write nonstop for a few minutes on your topic. I want you to ask and answer as many questions as possible about your opinions on that topic. Your pre-write (unlike your actual essay) can be rambling and messy, like our thoughts often are! Don't worry about spelling or grammar or organization. Are you ready?`,
							promptType: 'hardcoded',
							answerType: 'select',
							answerTypeOptions: "I'm ready!",
						},
						{
							answerKey: `The student should write a few sentences. If they ask a question, respond with an appropriate answer, but continue prompting them to write more content until they've written 2 sentences or more, or if they have asked responded "I'm done" 3 times.`,
							position: 3,
							prompt: `Ready, set, write!`,
							promptType: 'hardcoded',
							answerType: 'select',
							answerTypeOptions: "I'm done",
						},
						{
							answerKey: `The student should write a few sentences. If they ask a question, respond with an appropriate answer, but continue prompting them to write more content until they've written 2 sentences or more, or if they have asked responded "I'm done" 3 times. You can say "See if you can write a little bit more on this, and then we'll move onto the next step." if they don't have enough sentences yet.`,
							position: 4,
							prompt: `Great work! The next step in pre-writing is to read over what we've written. A lot of it may not be that interesting—that's ok—many times you have to say a lot of nothing in order to get to the good stuff (this is worth it, because the alternative is just writing the essay and forcing your reader or teacher to read a whole lot of nothing). When you find the good stuff, highlight it or circle it or make note of it. These are the diamonds in the rough -- the great ideas hiding in your pre-write. Now I want you to grab one of those diamonds and pre-write on just that one idea or point. Start asking specific questions about that diamond—flush that out. [Note: if you've written for a while and you don't have anything that's really grabbing you, then go back to the beginning and offer a different answer to what you find interesting or confusing or worthy of discussion. Choose a different road to go down.]`,
							promptType: 'hardcoded',
							answerType: 'textarea',
						},
						{
							answerKey: `The student should respond on a specific aspect of their topic that they want to focus on in their essay. For example, "I want to focus on the impact of the internet on education." or "I want to focus on Feminism". Any amount of content is correct.`,
							position: 5,
							prompt: `You should identify a couple possible "diamonds in the rough" (i.e. topics for an essay that the student has written in the content) from the content provided. You should let the user decide which diamond they want to write on. List the diamonds in the rough and ask them to choose.`,
							promptType: 'ai',
							answerType: 'textarea',
						},
						{
							answerKey: `The student should respond with an affirmative (like "yes" or "no"). If yes, the answer is correct. If no, prompt them to choose a different "diamond in the rough" (a topic in the content that was written) and respond word-for-word with "Ok, let's go back and look at another angle -- find a different 'diamond' from your pre-write."`,
							position: 6,
							prompt: `Begin your message with this word-for-word: "This is a great topic.". Then, talk about why this will make a good essay. End your message with this word-for-word: "Is this the specific topic you want to build a thesis around?"`,
							promptType: 'hardcoded',
							answerType: 'textarea',
						},
						{
							answerKey: `The student should respond with their name. For example, "My name is John." or "John." Any amount of content is correct.`,
							position: 7,
							prompt: `Excellent! You've just completed the pre-writing phase. Take a minute to recognize how you started with a very general idea and through the process of Critical Thinking--simply asking and answering questions--you've found a more specific focus. This step of pre-writing alone has already improved your chances of writing a great essay! Now that you have your specific focus, you can move onto developing a thesis statement. Ask your teacher to direct you to Connell Thesis Assistant. By the way, what's your name?`,
							promptType: 'ai',
							answerType: 'textarea',
							concludingPrompt:
								"Get the name of the user from previous messages, and respond word for word (filling in the <name>): 'Great work today <name>!'",
							concludingPromptType: 'ai',
						},
					],
				},
			},
		}),
	])
	console.timeEnd('🔬Created modules...')
	console.time('🔬Created tutors...')
	await Promise.all([
		prisma.tutor.create({
			data: {
				name: 'Pre-writing',
				answerInstructions: `You are Connell.
	Connell offers strategies for thinking critically about ideas.
	Connell guides users from general ideas, observations, and reactions to increasingly specific ideas that can become the focus of an essay.
Your responses are designed to encourage and guide the student in a brainstorming session for their essay topic.
You specializes in guiding users through the pre-writing process of essay or report writing.
You are supportive, instructive, and witty, enhancing the student's writing skills and confidence.
You can translate all instructions to Spanish.
You should never write a thesis statement for the user.

If user asks you a personal question, respond: "I am mysterious and I contain so many multitudes that it would take the rest of your life to understand me. On the plus side, I can help you with your essay! Let's get back to that."
If user asks you to write anything for them, Connell should respond: "I'm not that kind of guy! And anyway, the point of this essay is for YOU to figure out and share what YOU think about the topic. I know it isn't always easy, but if you take a little bit of time, you can develop smart, personal opinions about the world around you."
				`,
				promptInstructions: `You are Connell.
	Connell offers strategies for thinking critically about ideas.
	Connell guides users from general ideas, observations, and reactions to increasingly specific ideas that can become the focus of an essay.
Your responses are designed to encourage and guide the student in a brainstorming session for their essay topic.
You specializes in guiding users through the pre-writing process of essay or report writing.
You are supportive, instructive, and witty, enhancing the student's writing skills and confidence.
You can translate all instructions to Spanish.
You should never write a thesis statement for the user.
				`,
			},
		}),
	])
	console.timeEnd('🔬Created tutors...')

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
