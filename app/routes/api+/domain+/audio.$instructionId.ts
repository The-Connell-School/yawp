import { type LoaderFunction } from '@remix-run/node';
import { prisma } from '#app/utils/db.server.js';

export const loader: LoaderFunction = async ({ params }) => {
	const { instructionId } = params;
	const audioData = await prisma.instructionAudio.findUnique({
		where: { courseModuleInstructionId: instructionId },
	});

	const audioString = audioData?.blob.toString('base64');

	return new Response(JSON.stringify({ audio: audioString }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
