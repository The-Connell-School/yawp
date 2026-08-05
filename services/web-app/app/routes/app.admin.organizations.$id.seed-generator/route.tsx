import {
  data as dataResponse,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { requireAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isIsolatedPreviewSeatMode } from '~/utils/preview-access.server';
import {
  proposeSeedData,
  type SeedGeneratorContext,
} from '~/domain/admin-seed-generator/seed-generator-propose.server';
import { commitApprovedSeedData } from '~/domain/admin-seed-generator/seed-generator-write.server';
import { seedCommitProposalSchema } from '~/domain/admin-seed-generator/seed-generator-schema';

const MAX_INSTRUCTIONS_CHARS = 2000;

/**
 * Gated exactly like `createPreviewSeat` in
 * app/routes/app.admin.organizations._index/route.server.ts: a 404, not a
 * redirect or an error banner, so the feature's very existence is invisible
 * outside preview/demo environments.
 */
async function requirePreviewSeatMode() {
  if (!isIsolatedPreviewSeatMode()) {
    throw new Response('Not found', { status: 404 });
  }
}

async function loadOrganizationContext(organizationId: string) {
  const [organization, existingClasses, organizationAssignmentTypes] =
    await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true },
      }),
      prisma.class.findMany({
        where: { school: { organizationId } },
        select: { id: true, title: true, grade: true, period: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.organizationAssignmentType.findMany({
        where: { organizationId },
        include: {
          assignmentType: { select: { id: true, title: true, description: true } },
        },
      }),
    ]);

  if (!organization) {
    throw new Response('Not found', { status: 404 });
  }

  const existingAssignmentTypes = organizationAssignmentTypes.map(
    (row) => row.assignmentType
  );

  return { organization, existingClasses, existingAssignmentTypes };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAdmin(request);
  await requirePreviewSeatMode();

  const organizationId = params.id;
  if (!organizationId) throw new Response('Not found', { status: 404 });

  const { organization, existingClasses, existingAssignmentTypes } =
    await loadOrganizationContext(organizationId);

  return dataResponse({
    organization,
    existingClasses,
    existingAssignmentTypes,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  await requireAdmin(request);
  await requirePreviewSeatMode();

  const organizationId = params.id;
  if (!organizationId) throw new Response('Not found', { status: 404 });

  const formData = await request.formData();
  const intent = formData.get('intent');

  const { organization, existingClasses, existingAssignmentTypes } =
    await loadOrganizationContext(organizationId);

  if (intent === 'propose') {
    const instructions = formData.get('instructions')?.toString().trim();
    if (!instructions) {
      return dataResponse(
        { error: 'Describe what demo data you want first.' },
        { status: 400 }
      );
    }
    if (instructions.length > MAX_INSTRUCTIONS_CHARS) {
      return dataResponse(
        { error: `Keep the description under ${MAX_INSTRUCTIONS_CHARS} characters.` },
        { status: 400 }
      );
    }

    const ctx: SeedGeneratorContext = {
      organizationId,
      organizationName: organization.name,
      existingClasses,
      existingAssignmentTypes,
    };
    const result = await proposeSeedData({ ctx, instructions });
    if ('error' in result) {
      return dataResponse({ error: result.error }, { status: 502 });
    }
    return dataResponse({ proposal: result.proposal });
  }

  if (intent === 'commit') {
    const rawProposal = formData.get('proposal')?.toString();
    if (!rawProposal) {
      return dataResponse({ error: 'No proposal to commit.' }, { status: 400 });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawProposal);
    } catch {
      return dataResponse({ error: 'The proposal payload was malformed.' }, { status: 400 });
    }

    const validated = seedCommitProposalSchema.safeParse(parsedJson);
    if (!validated.success) {
      return dataResponse(
        { error: 'The proposal did not match the expected shape. Regenerate and try again.' },
        { status: 400 }
      );
    }

    const assignmentTypeIdByTitle = new Map(
      existingAssignmentTypes.map((t) => [t.title, t.id])
    );
    const existingClassIds = new Set(existingClasses.map((c) => c.id));

    try {
      const summary = await commitApprovedSeedData(prisma, validated.data, {
        organizationId,
        organizationName: organization.name,
        existingClassIds,
        assignmentTypeIdByTitle,
      });
      return dataResponse({ summary });
    } catch (error) {
      return dataResponse(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Could not write the approved seed data.',
        },
        { status: 500 }
      );
    }
  }

  return dataResponse({ error: 'Unknown intent.' }, { status: 400 });
}
