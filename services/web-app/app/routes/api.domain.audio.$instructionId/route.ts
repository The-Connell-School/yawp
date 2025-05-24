import { type LoaderFunction } from 'react-router';
import { prisma } from '~/utils/db.server.js';

export const loader: LoaderFunction = async ({ params }) => {
	const { instructionId } = params;
	const audioData = await prisma.instructionAudio.findUnique({
		where: { courseModuleInstructionId: instructionId },
	});

	const audioString = audioData?.blob.toString();

	return new Response(JSON.stringify({ audio: audioString }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
