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
  options: { released: boolean; overallScore: number; numericPercentage: number }
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

function expectNoGradedAtInDocumentLoader(
  loaderData: unknown,
  submissionId: string
) {
  const route = getRouteLoaderData(loaderData, 'app_.documents_.$id');
  const lists: Record<string, unknown>[][] = [];
  if (Array.isArray(route.submissions)) {
    lists.push(route.submissions as Record<string, unknown>[]);
  }
  const doc = route.doc;
  if (doc && typeof doc === 'object' && Array.isArray((doc as { submissions?: unknown }).submissions)) {
    lists.push(
      (doc as { submissions: Record<string, unknown>[] }).submissions
    );
  }
  expect(lists.length).toBe(2);
  for (const list of lists) {
    const row = list.find((entry) => entry.id === submissionId);
    expect(row).toBeTruthy();
    expect(row!.gradedAt).toBeUndefined();
  }
}

test.describe.serial('Unreleased grade privacy in student loader responses', () => {
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

    const documentDataText = await (
      await page.request.get(
        `/app/documents/${gradePrivacy.documentId}.data?revise=1`
      )
    ).text();
    const documentLoader = decodeRouterDataResponse(documentDataText);
    expectNoGradedAtInDocumentLoader(
      documentLoader,
      gradePrivacy.submissionId
    );

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
