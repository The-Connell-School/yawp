import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { validationError, parseFormData } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

const validator = z.object({
  documentIds: z.string(), // Comma-separated list
  score: z.string().optional(),
  maxScore: z.string().optional(),
  feedback: z.string().optional(),
  status: z.enum(['draft', 'released']),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile?.teacherProfile) {
    return dataResponse({ error: 'Teacher profile required.' }, { status: 403 });
  }

  const { error, data } = await parseFormData(request, validator);
  if (error) return validationError(error);

  // Parse document IDs
  const documentIds = data.documentIds.split(',').filter(Boolean);

  if (documentIds.length === 0) {
    return dataResponse({ error: 'No documents provided.' }, { status: 400 });
  }

  // Verify teacher has access to all documents
  const documents = await prisma.document.findMany({
    where: {
      id: { in: documentIds },
      class: {
        teachers: {
          some: { id: profile.teacherProfile.id },
        },
      },
    },
  });

  if (documents.length !== documentIds.length) {
    return dataResponse(
      { error: 'Some documents not found or access denied.' },
      { status: 404 }
    );
  }

  // Convert score strings to numbers
  const scoreNum = data.score ? parseFloat(data.score) : null;
  const maxScoreNum = data.maxScore ? parseFloat(data.maxScore) : 100;

  // Process each document
  const results = [];
  for (const documentId of documentIds) {
    const existingGrade = await prisma.grade.findUnique({
      where: { documentId },
    });

    let grade;
    if (existingGrade) {
      // Update existing grade
      grade = await prisma.grade.update({
        where: { documentId },
        data: {
          score: scoreNum,
          maxScore: maxScoreNum,
          feedback: data.feedback || null,
          status: data.status,
          releasedAt: data.status === 'released' ? new Date() : null,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new grade
      grade = await prisma.grade.create({
        data: {
          documentId,
          teacherProfileId: profile.teacherProfile.id,
          score: scoreNum,
          maxScore: maxScoreNum,
          feedback: data.feedback || null,
          status: data.status,
          releasedAt: data.status === 'released' ? new Date() : null,
        },
      });
    }
    results.push(grade);
  }

  return dataResponse({ grades: results, count: results.length }, { status: 200 });
}
