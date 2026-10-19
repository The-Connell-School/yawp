import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import {
  decodeRouterDataResponse,
  findObjectsWithId,
  getRouteLoaderData,
  walkTurboDecoded,
} from '../decode-router-data';

function expectSubmissionPrivacy(
  submission: Record<string, unknown>,
  options: {
    released: boolean;
    overallScore: number;
    numericPercentage: number;
  }
) {
  if (options.released) {
    expect(submission.overallScore).toBe(options.overallScore);
    expect(submission.numericPercentage).toBe(options.numericPercentage);
    expect(submission.gradedAt).toBeTruthy();
  } else {
    expect(submission.overallScore).toBeUndefined();
    expect(submission.numericPercentage).toBeUndefined();
    expect(submission.score).toBeUndefined();
    expect(submission.feedback).toBeUndefined();
    expect(submission.gradedAt).toBeUndefined();
  }
}

function submissionFromRouteData(
  loaderData: unknown,
  routeIdSuffix: string,
  submissionId: string
) {
  const route = getRouteLoaderData(loaderData, routeIdSuffix);
  const matches = findObjectsWithId(route.submission ?? route, submissionId);
  expect(matches.length).toBeGreaterThan(0);
  return matches[0]!;
}

test.describe
  .serial('Unreleased grade privacy in student loader responses', () => {
  test('student submission, document, and assignment-type data omit unreleased scores', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { gradePrivacy } = e2eContext;
    await signIn(e2eContext.userEmail, 'johndoe');

    const submissionDataText = await (
      await page.request.get(
        `/app/submissions/${gradePrivacy.submissionId}.data`
      )
    ).text();
    const submissionLoader = decodeRouterDataResponse(submissionDataText);
    const submission = submissionFromRouteData(
      submissionLoader,
      'app_.submissions_.$submissionId',
      gradePrivacy.submissionId
    );
    expectSubmissionPrivacy(submission, {
      released: false,
      overallScore: gradePrivacy.unreleasedOverallScore,
      numericPercentage: gradePrivacy.unreleasedNumericPercentage,
    });
    expect(submission.comments).toEqual([]);
    expect(submissionDataText).not.toContain(gradePrivacy.probeComment);

    const documentHtml = await (
      await page.request.get(
        `/app/documents/${gradePrivacy.documentId}?revise=1`
      )
    ).text();
    const documentDataText = await (
      await page.request.get(
        `/app/documents/${gradePrivacy.documentId}.data?revise=1`
      )
    ).text();
    const gradedAtWire = /"gradedAt",\["D",|\\"gradedAt\\",\["D",/;
    const myDocumentsDataText = await (
      await page.request.get('/app/my-documents.data')
    ).text();
    expect(myDocumentsDataText).not.toMatch(gradedAtWire);
    expect(documentHtml).not.toMatch(gradedAtWire);
    expect(documentDataText).not.toMatch(gradedAtWire);

    expect(documentDataText).not.toContain(gradePrivacy.probeComment);
    expect(documentDataText).not.toMatch(
      new RegExp(
        `overallScore",${gradePrivacy.unreleasedOverallScore}|overallScore\\\\",${gradePrivacy.unreleasedOverallScore}`
      )
    );

    const documentLoader = decodeRouterDataResponse(documentDataText);
    const documentRoute = getRouteLoaderData(
      documentLoader,
      'app_.documents_.$id'
    );
    const documentSubmissionRows = findObjectsWithId(
      documentRoute,
      gradePrivacy.submissionId
    );
    expect(documentSubmissionRows.length).toBeGreaterThan(0);
    for (const row of documentSubmissionRows) {
      expect(row.gradedAt).toBeUndefined();
      expect(row.overallScore).toBeUndefined();
      expect(row.numericPercentage).toBeUndefined();
    }

    const assignmentTypeDataText = await (
      await page.request.get(
        `/app/assignment-types/${gradePrivacy.assignmentTypeId}.data`
      )
    ).text();
    const assignmentLoader = decodeRouterDataResponse(assignmentTypeDataText);
    const assignmentMatches = findObjectsWithId(
      assignmentLoader,
      gradePrivacy.submissionId
    );
    expect(assignmentMatches.length).toBeGreaterThan(0);
    for (const row of assignmentMatches) {
      expect(row.overallScore).toBeUndefined();
      expect(row.numericPercentage).toBeUndefined();
      expect(row.gradedAt).toBeUndefined();
    }

    const dailyPagesLoader = decodeRouterDataResponse(
      await (
        await page.request.get(
          `/app/assignment-types/${gradePrivacy.dailyPagesAssignmentTypeId}.data`
        )
      ).text()
    );
    const leakedDailyPagesScores: Record<string, unknown>[] = [];
    walkTurboDecoded(dailyPagesLoader, (value) => {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (value as { overallScore?: unknown }).overallScore ===
          gradePrivacy.dailyPagesUnreleasedOverallScore
      ) {
        leakedDailyPagesScores.push(value as Record<string, unknown>);
      }
    });
    expect(leakedDailyPagesScores).toHaveLength(0);
  });

  test('after release, student submission shows points and feedback', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { gradePrivacy } = e2eContext;
    const prisma = createE2EPrismaClient();
    await prisma.submission.update({
      where: { id: gradePrivacy.releaseSubmissionId },
      data: { releasedAt: new Date() },
    });
    await prisma.$disconnect();

    await signIn(e2eContext.userEmail, 'johndoe');
    const submissionHtml = await (
      await page.request.get(
        `/app/submissions/${gradePrivacy.releaseSubmissionId}`
      )
    ).text();
    const submissionLoader = decodeRouterDataResponse(
      await (
        await page.request.get(
          `/app/submissions/${gradePrivacy.releaseSubmissionId}.data`
        )
      ).text()
    );
    const submission = submissionFromRouteData(
      submissionLoader,
      'app_.submissions_.$submissionId',
      gradePrivacy.releaseSubmissionId
    );

    expect(submissionHtml).toContain('80 / 100');
    expectSubmissionPrivacy(submission, {
      released: true,
      overallScore: gradePrivacy.unreleasedOverallScore,
      numericPercentage: gradePrivacy.unreleasedNumericPercentage,
    });
    expect(submission.comments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: gradePrivacy.releaseComment }),
      ])
    );
    expect(submissionHtml).toContain(gradePrivacy.releaseComment);
  });
});

test('answer keys stay private in solo/shared document loaders and session APIs', async ({
  page,
  signIn,
  e2eContext,
}) => {
  const prisma = createE2EPrismaClient();
  const probe = `private-instruction-key-${Date.now()}`;
  const createdIds: string[] = [];
  try {
    await signIn(e2eContext.userEmail, 'johndoe');
    for (const [documentId, assignmentTypeId, route] of [
      [e2eContext.editedDocumentId, e2eContext.assignmentTypeId, 'documents'],
      [
        e2eContext.collabDocumentId,
        e2eContext.collabAssignmentTypeId,
        'collab-documents',
      ],
    ]) {
      const module = await prisma.assignmentModule.findFirstOrThrow({
        where: { assignmentTypeId, deletedAt: null },
        orderBy: { position: 'asc' },
      });
      const instruction = await prisma.assignmentModuleInstruction.create({
        data: {
          assignmentModuleId: module.id,
          title: 'Privacy probe',
          prompt: 'Public instruction',
          position: 999,
          answerKey: probe,
          nextButtonLabel: 'Continue',
        },
      });
      createdIds.push(instruction.id);
      const loader = await page.request.get(`/app/${route}/${documentId}.data`);
      expect(loader.ok()).toBe(true);
      const text = await loader.text();
      expect(text).not.toContain(probe);
      expect(text).not.toContain('answerKey');
      expect(
        findObjectsWithId(decodeRouterDataResponse(text), instruction.id).length
      ).toBeGreaterThan(0);
      const opened = await page.request.post(
        '/api/model/assignment-module-session',
        {
          multipart: { documentId, assignmentModuleId: module.id },
        }
      );
      expect(opened.ok()).toBe(true);
      const openText = await opened.text();
      expect(openText).not.toContain(probe);
      expect(openText).not.toContain('answerKey');
      const { cms } = JSON.parse(openText);
      expect(
        cms.assignmentModule.instructions.some(
          (s: { id: string }) => s.id === instruction.id
        )
      ).toBe(true);
      const advanced = await page.request.post(
        `/api/model/assignment-module-session/${cms.id}`,
        {
          multipart: {
            instructionsCompleted: String(cms.instructionsCompleted),
          },
        }
      );
      expect(advanced.ok()).toBe(true);
      const advanceText = await advanced.text();
      expect(advanceText).toContain(instruction.id);
      expect(advanceText).not.toContain(probe);
      expect(advanceText).not.toContain('answerKey');
    }
  } finally {
    await prisma.assignmentModuleInstruction.deleteMany({
      where: { id: { in: createdIds } },
    });
    await prisma.$disconnect();
  }
});
