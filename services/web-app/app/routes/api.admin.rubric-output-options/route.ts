import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import {
  readOutputSchemaTeacherNotes,
  resolveRubricOutputOptionsForAssignmentType,
  setRubricTeacherNotesEnabled,
} from '~/domain/rubrics/rubric-output-options.server';
import { RubricCatalog } from '~/domain/rubrics/rubric-catalog.server';
import { requireAdmin, requireSuperAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  rubricCatalogErrorBody,
  rubricCatalogErrorResponse,
} from './catalog-errors.server';

const toggleInput = z
  .object({
    catalogKey: z.string().min(1).max(160),
    enabled: z.boolean(),
    expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    requestId: z.string().uuid(),
  })
  .strict();

export async function loader({ request }: ActionFunctionArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const assignmentTypeId = url.searchParams.get('assignmentTypeId');
  const catalogKey = url.searchParams.get('catalogKey');

  if (assignmentTypeId) {
    try {
      const state = await resolveRubricOutputOptionsForAssignmentType(
        prisma,
        assignmentTypeId
      );
      return dataResponse({ state });
    } catch (error) {
      const failure = rubricCatalogErrorResponse(error);
      return dataResponse(rubricCatalogErrorBody(failure), {
        status: failure.status,
      });
    }
  }

  if (catalogKey) {
    try {
      const catalog = new RubricCatalog(prisma);
      const detail = await catalog.get(catalogKey);
      return dataResponse({
        state: {
          catalogKey,
          teacherNotesEnabled: readOutputSchemaTeacherNotes(detail.live.content),
          fingerprint: detail.live.fingerprint,
        },
      });
    } catch (error) {
      const failure = rubricCatalogErrorResponse(error);
      return dataResponse(rubricCatalogErrorBody(failure), {
        status: failure.status,
      });
    }
  }

  return dataResponse({ error: 'Missing assignmentTypeId or catalogKey.' }, { status: 400 });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireSuperAdmin(request);
  if (request.method !== 'POST') {
    return dataResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return dataResponse({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = toggleInput.safeParse(body);
  if (!parsed.success) {
    return dataResponse({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const result = await setRubricTeacherNotesEnabled({
      db: prisma,
      catalogKey: parsed.data.catalogKey,
      enabled: parsed.data.enabled,
      expectedFingerprint: parsed.data.expectedFingerprint,
      actorEmail: user.email ?? user.id,
      requestId: parsed.data.requestId,
    });

    return dataResponse({
      status: 'success',
      teacherNotesEnabled: result.teacherNotesEnabled,
      fingerprint: result.fingerprint,
      revision: result.revision,
      replayed: result.replayed,
    });
  } catch (error) {
    const failure = rubricCatalogErrorResponse(error);
    return dataResponse(rubricCatalogErrorBody(failure), { status: failure.status });
  }
}
