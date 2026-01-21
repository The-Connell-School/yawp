import { invariantResponse } from '@epic-web/invariant';
import { type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireProfile } from '~/utils/auth.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  invariantResponse(params.id, 'id is required', { status: 400 });

  // Require authentication to download rubrics
  const user = await requireProfile(request, undefined);

  const rubric = await prisma.rubric.findUnique({
    where: { id: params.id },
    select: {
      pdfFileName: true,
      pdfContentType: true,
      pdfBlob: true,
      organizationId: true,
    },
  });

  invariantResponse(rubric, 'Rubric not found', { status: 404 });

  // Verify user has access to this rubric (belongs to same organization)
  const userProfile = await prisma.profile.findFirst({
    where: { userId: user.id },
    select: { organizationId: true },
  });

  invariantResponse(
    userProfile && userProfile.organizationId === rubric.organizationId,
    'Unauthorized',
    { status: 403 }
  );

  invariantResponse(rubric.pdfBlob, 'PDF not available for this rubric', { status: 404 });

  return new Response(rubric.pdfBlob as unknown as Blob, {
    headers: {
      'Content-Type': rubric.pdfContentType || 'application/pdf',
      'Content-Length': Buffer.byteLength(rubric.pdfBlob).toString(),
      'Content-Disposition': `attachment; filename="${rubric.pdfFileName || 'rubric.pdf'}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
