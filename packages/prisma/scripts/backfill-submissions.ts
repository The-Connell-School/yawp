import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

async function backfill() {
  console.log('Starting Submission backfill...');

  const snapshotsWithGrades = await prisma.documentSnapshot.findMany({
    where: {
      submittedAt: { not: null },
    },
    select: {
      id: true,
      documentId: true,
      title: true,
      text: true,
      html: true,
      submittedAt: true,
      createdAt: true,
      grades: {
        select: {
          id: true,
          score: true,
          feedback: true,
          rubricScores: true,
          overallScore: true,
          overallComment: true,
          numericPercentage: true,
          letterGrade: true,
          grammarIssues: true,
          promptConfig: true,
          aiMeta: true,
          gradedById: true,
          releasedAt: true,
          createdAt: true,
          essayTitle: true,
          essayText: true,
          essayHtml: true,
        },
      },
    },
  });

  let created = 0;
  let skipped = 0;

  for (const snapshot of snapshotsWithGrades) {
    // Check if already backfilled
    const existing = await prisma.submission.findUnique({
      where: { legacySnapshotId: snapshot.id },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const grade = snapshot.grades[0]; // At most one per snapshot (unique constraint)
    const submittedAt = snapshot.submittedAt ?? snapshot.createdAt;

    // Field priority: prefer Grade.essay* fields when present, fall back to snapshot
    const title = (grade?.essayTitle ?? snapshot.title) || 'Untitled';
    const text = grade?.essayText ?? snapshot.text;
    const html = grade?.essayHtml ?? snapshot.html;

    await prisma.submission.create({
      data: {
        documentId: snapshot.documentId,
        title,
        text,
        html,
        submittedAt,
        legacySnapshotId: snapshot.id,
        ...(grade
          ? {
              score: grade.score,
              feedback: grade.feedback,
              rubricScores: grade.rubricScores ?? undefined,
              overallScore: grade.overallScore,
              overallComment: grade.overallComment,
              numericPercentage: grade.numericPercentage,
              letterGrade: grade.letterGrade,
              grammarIssues: grade.grammarIssues ?? undefined,
              promptConfig: grade.promptConfig ?? undefined,
              aiMeta: grade.aiMeta ?? undefined,
              gradedAt: grade.createdAt,
              gradedById: grade.gradedById,
              releasedAt: grade.releasedAt,
            }
          : {}),
      },
    });

    // Backfill SubmissionComments from GradeComments
    if (grade) {
      const gradeComments = await prisma.gradeComment.findMany({
        where: { gradeId: grade.id },
        select: {
          content: true,
          excerpt: true,
          occurrence: true,
          profileId: true,
          createdAt: true,
        },
      });

      const submission = await prisma.submission.findUnique({
        where: { legacySnapshotId: snapshot.id },
        select: { id: true },
      });

      if (submission && gradeComments.length > 0) {
        await prisma.submissionComment.createMany({
          data: gradeComments.map((c) => ({
            submissionId: submission.id,
            content: c.content,
            excerpt: c.excerpt,
            occurrence: c.occurrence,
            profileId: c.profileId,
            createdAt: c.createdAt,
          })),
        });
      }
    }

    created++;

    if (created % 100 === 0) {
      console.log(`  Progress: ${created} created, ${skipped} skipped`);
    }
  }

  console.log(`Backfill complete. Created: ${created}, Skipped: ${skipped}`);
}

backfill()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
