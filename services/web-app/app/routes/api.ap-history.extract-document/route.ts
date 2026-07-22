import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { extractApHistoryPdf } from '~/domain/ap-history/pdf-extraction.server';
import { isApHistoryPdfImportEnabled } from '~/domain/ap-history/pdf-import-flag.server';
import {
  AiRateLimitError,
  reserveAiRequest,
  type AiAdmissionPolicy,
} from '~/utils/ai-admission.server';
import { isAssignmentTypeAvailableForEveryScope } from '~/utils/assignment-type-access.server';
import {
  requireMembership,
  requireMutableRequest,
  requireUserId,
} from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const PDF_MAGIC = Buffer.from('%PDF');
const AP_HISTORY_PDF_IMPORT_ADMISSION_POLICY: AiAdmissionPolicy = {
  membershipLimit: 4,
  membershipWindowMs: 60_000,
  organizationLimit: 40,
  organizationWindowMs: 60 * 60_000,
};

function failure(message: string, status: number, headers?: HeadersInit) {
  return dataResponse({ success: false, message }, { status, headers });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return failure('Only teachers can import AP History assignments.', 403);
  }

  const form = await request.formData();
  const classId = form.get('classId');
  const assignmentTypeId = form.get('assignmentTypeId');
  const file = form.get('file');

  if (
    typeof classId !== 'string' ||
    !classId.trim() ||
    typeof assignmentTypeId !== 'string' ||
    !assignmentTypeId.trim()
  ) {
    return failure('Class and assignment type are required.', 400);
  }
  if (!(file instanceof File) || file.size <= 0) {
    return failure('A nonempty PDF file is required.', 400);
  }
  if (file.size > MAX_PDF_BYTES) {
    return failure('PDF is too large. Maximum size is 10 MB.', 400);
  }
  const contentTypeAllowed =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!contentTypeAllowed) {
    return failure('Only PDF files are supported.', 400);
  }

  const pdfBytes = Buffer.from(await file.arrayBuffer());
  if (
    pdfBytes.length < PDF_MAGIC.length ||
    !pdfBytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)
  ) {
    return failure('The uploaded file is not a valid PDF.', 400);
  }

  const organizationId = profile.organization.id;
  const klass = await prisma.class.findFirst({
    where: {
      id: classId.trim(),
      isArchived: false,
      teachers: { some: { id: profile.id } },
      school: { organizationId },
    },
    select: {
      id: true,
      school: {
        select: {
          id: true,
          organizationId: true,
          organization: {
            select: { apHistoryPdfImportEnabled: true },
          },
        },
      },
    },
  });
  if (!klass) {
    return failure('Class not found.', 404);
  }

  const assignmentType = await prisma.assignmentType.findFirst({
    where: {
      id: assignmentTypeId.trim(),
      systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY,
      archivedAt: null,
    },
    select: { id: true, systemKey: true },
  });
  const assignmentTypeAvailable =
    assignmentType &&
    (await isAssignmentTypeAvailableForEveryScope({
      assignmentTypeId: assignmentType.id,
      scopes: [
        {
          organizationId,
          schoolId: klass.school.id,
          teacherProfileId: profile.id,
        },
      ],
    }));
  if (!assignmentType || !assignmentTypeAvailable) {
    return failure('AP History import is unavailable.', 404);
  }
  if (
    !isApHistoryPdfImportEnabled(
      klass.school.organization.apHistoryPdfImportEnabled,
    )
  ) {
    return failure('AP History import is unavailable.', 404);
  }

  try {
    await reserveAiRequest({
      membershipId: profile.id,
      organizationId,
      feature: 'ap-history-pdf-import',
      policy: AP_HISTORY_PDF_IMPORT_ADMISSION_POLICY,
    });
  } catch (error) {
    if (error instanceof AiRateLimitError) {
      return failure(
        'AP History PDF import is busy. Please try again shortly.',
        429,
        { 'Retry-After': String(error.retryAfterSeconds) },
      );
    }
    throw error;
  }

  try {
    const extracted = await extractApHistoryPdf({ pdfBytes });
    return dataResponse({ success: true, ...extracted });
  } catch {
    return failure('Could not read that AP History PDF. Please try again.', 502);
  }
}
