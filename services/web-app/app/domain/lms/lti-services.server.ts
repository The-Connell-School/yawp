import { z } from 'zod';
import {
  fetchLtiNetwork,
  readLtiJson,
  throwLtiHttpStatus,
} from './lti-http.server';
import {
  assertAllowedLtiServiceUrl,
  type LtiRegistration,
} from './lti-registration';

export const LTI_NRPS_MEDIA_TYPE =
  'application/vnd.ims.lti-nrps.v2.membershipcontainer+json';
export const LTI_AGS_LINE_ITEM_MEDIA_TYPE =
  'application/vnd.ims.lis.v2.lineitem+json';
export const LTI_AGS_SCORE_MEDIA_TYPE = 'application/vnd.ims.lis.v1.score+json';

export const LTI_SCOPES = {
  contextMembershipReadonly:
    'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
  lineItem: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  lineItemReadonly:
    'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  resultReadonly:
    'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
} as const;

const ContextSchema = z.object({
  id: z.string().min(1),
  label: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});

const MemberSchema = z.object({
  user_id: z.string().min(1),
  roles: z.array(z.string().min(1)),
  status: z.enum(['Active', 'Inactive', 'Deleted']).default('Active'),
  name: z.string().nullable().optional(),
  given_name: z.string().nullable().optional(),
  family_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  lis_person_sourcedid: z.string().nullable().optional(),
});

const MembershipContainerSchema = z.object({
  id: z.string().min(1),
  context: ContextSchema,
  members: z.array(MemberSchema),
});

function parseNextLink(header: string | null, currentUrl: URL): string | null {
  if (!header) return null;
  const linkPattern = /<([^>]+)>\s*((?:;\s*[^,]+)*)/g;
  for (const match of header.matchAll(linkPattern)) {
    const parameters = match[2]
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean);
    const rel = parameters
      .find((parameter) => /^rel\s*=/i.test(parameter))
      ?.replace(/^rel\s*=\s*/i, '')
      .replace(/^"|"$/g, '')
      .split(/\s+/);
    if (rel?.some((value) => value.toLowerCase() === 'next')) {
      return new URL(match[1], currentUrl).toString();
    }
  }
  return null;
}

export async function fetchAllNrpsMemberships(input: {
  membershipsUrl: string;
  accessToken: string;
  registration: LtiRegistration;
  expectedContextId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const initialUrl = assertAllowedLtiServiceUrl(
    input.membershipsUrl,
    input.registration
  );
  let nextUrl: string | null = initialUrl.toString();
  let context: z.infer<typeof ContextSchema> | null = null;
  const members: z.infer<typeof MemberSchema>[] = [];
  const visited = new Set<string>();

  while (nextUrl) {
    if (visited.size >= 100 || visited.has(nextUrl)) {
      throw new Error('NRPS pagination loop or page limit detected.');
    }
    visited.add(nextUrl);
    const current = assertAllowedLtiServiceUrl(nextUrl, input.registration);
    if (current.origin !== initialUrl.origin) {
      throw new Error('NRPS next-page URL changed service origin.');
    }
    const response = await fetchLtiNetwork({
      operation: 'NRPS request',
      url: current,
      fetchImpl: input.fetchImpl,
      timeoutMs: input.timeoutMs,
      init: {
        headers: {
          accept: LTI_NRPS_MEDIA_TYPE,
          authorization: `Bearer ${input.accessToken}`,
        },
      },
    });
    if (!response.ok) throwLtiHttpStatus(response, 'NRPS request');
    if (!response.headers.get('content-type')?.includes(LTI_NRPS_MEDIA_TYPE)) {
      throw new Error('NRPS response used an unexpected media type.');
    }
    let page: z.infer<typeof MembershipContainerSchema>;
    try {
      page = MembershipContainerSchema.parse(
        await readLtiJson(response, 'NRPS response')
      );
    } catch (error) {
      throw new Error('NRPS response did not match the membership contract.', {
        cause: error,
      });
    }
    if (page.context.id !== input.expectedContextId) {
      throw new Error('NRPS response context did not match the signed launch.');
    }
    if (context && page.context.id !== context.id) {
      throw new Error('NRPS pagination changed context id.');
    }
    context = page.context;
    members.push(...page.members);
    nextUrl = parseNextLink(response.headers.get('link'), current);
  }

  if (!context) throw new Error('NRPS returned no membership pages.');
  return {
    context: {
      id: context.id,
      label: context.label ?? null,
      title: context.title ?? null,
    },
    members: members.map((member) => ({
      userId: member.user_id,
      roles: member.roles,
      status: member.status,
      name: member.name ?? null,
      givenName: member.given_name ?? null,
      familyName: member.family_name ?? null,
      email: member.email ?? null,
      sourcedId: member.lis_person_sourcedid ?? null,
    })),
  };
}

const AgsLineItemSchema = z.object({
  id: z.string().url(),
  scoreMaximum: z.number().positive(),
  label: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  resourceLinkId: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  startDateTime: z.string().datetime().optional(),
  endDateTime: z.string().datetime().optional(),
});

const AgsLineItemInputSchema = AgsLineItemSchema.omit({ id: true });
export type AgsLineItemInput = z.input<typeof AgsLineItemInputSchema>;

async function parseAgsLineItemResponse(
  response: Response,
  registration: LtiRegistration
) {
  if (!response.ok) throwLtiHttpStatus(response, 'AGS line-item request');
  if (
    !response.headers
      .get('content-type')
      ?.includes(LTI_AGS_LINE_ITEM_MEDIA_TYPE)
  ) {
    throw new Error('AGS line-item response used an unexpected media type.');
  }
  let lineItem: z.infer<typeof AgsLineItemSchema>;
  try {
    lineItem = AgsLineItemSchema.parse(
      await readLtiJson(response, 'AGS line-item response')
    );
  } catch (error) {
    throw new Error('AGS line-item response did not match the contract.', {
      cause: error,
    });
  }
  assertAllowedLtiServiceUrl(lineItem.id, registration);
  return lineItem;
}

export async function createAgsLineItem(input: {
  lineItemsUrl: string;
  accessToken: string;
  registration: LtiRegistration;
  lineItem: AgsLineItemInput;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const lineItemsUrl = assertAllowedLtiServiceUrl(
    input.lineItemsUrl,
    input.registration
  );
  const body = AgsLineItemInputSchema.parse(input.lineItem);
  const response = await fetchLtiNetwork({
    operation: 'AGS line-item create',
    url: lineItemsUrl,
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    init: {
      method: 'POST',
      headers: {
        accept: LTI_AGS_LINE_ITEM_MEDIA_TYPE,
        authorization: `Bearer ${input.accessToken}`,
        'content-type': LTI_AGS_LINE_ITEM_MEDIA_TYPE,
      },
      body: JSON.stringify(body),
    },
  });
  return parseAgsLineItemResponse(response, input.registration);
}

export async function getAgsLineItem(input: {
  lineItemUrl: string;
  accessToken: string;
  registration: LtiRegistration;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const url = assertAllowedLtiServiceUrl(input.lineItemUrl, input.registration);
  const response = await fetchLtiNetwork({
    operation: 'AGS line-item read',
    url,
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    init: {
      headers: {
        accept: LTI_AGS_LINE_ITEM_MEDIA_TYPE,
        authorization: `Bearer ${input.accessToken}`,
      },
    },
  });
  return parseAgsLineItemResponse(response, input.registration);
}

export async function updateAgsLineItem(input: {
  lineItemUrl: string;
  accessToken: string;
  registration: LtiRegistration;
  lineItem: z.input<typeof AgsLineItemSchema>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const url = assertAllowedLtiServiceUrl(input.lineItemUrl, input.registration);
  const parsed = AgsLineItemSchema.parse(input.lineItem);
  if (parsed.id !== url.toString()) {
    throw new Error('AGS line-item update cannot change the immutable id.');
  }
  const { id: _id, ...body } = parsed;
  const response = await fetchLtiNetwork({
    operation: 'AGS line-item update',
    url,
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    init: {
      method: 'PUT',
      headers: {
        accept: LTI_AGS_LINE_ITEM_MEDIA_TYPE,
        authorization: `Bearer ${input.accessToken}`,
        'content-type': LTI_AGS_LINE_ITEM_MEDIA_TYPE,
      },
      body: JSON.stringify(body),
    },
  });
  const updated = await parseAgsLineItemResponse(response, input.registration);
  if (
    updated.id !== parsed.id ||
    updated.resourceLinkId !== parsed.resourceLinkId
  ) {
    throw new Error('AGS line-item update changed immutable identifiers.');
  }
  return updated;
}

const AgsScoreSchema = z
  .object({
    userId: z.string().min(1),
    scoreGiven: z.number().nonnegative().optional(),
    scoreMaximum: z.number().positive().optional(),
    activityProgress: z.enum([
      'Initialized',
      'Started',
      'InProgress',
      'Submitted',
      'Completed',
    ]),
    gradingProgress: z.enum([
      'NotReady',
      'Failed',
      'Pending',
      'PendingManual',
      'FullyGraded',
    ]),
    timestamp: z.string().datetime(),
    comment: z.string().optional(),
  })
  .superRefine((score, context) => {
    if (score.scoreGiven !== undefined && score.scoreMaximum === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AGS scoreMaximum is required when scoreGiven is present.',
        path: ['scoreMaximum'],
      });
    }
  });

export async function submitAgsScore(input: {
  lineItemUrl: string;
  accessToken: string;
  registration: LtiRegistration;
  score: z.input<typeof AgsScoreSchema>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const lineItemUrl = assertAllowedLtiServiceUrl(
    input.lineItemUrl,
    input.registration
  )
    .toString()
    .replace(/\/$/, '');
  const score = AgsScoreSchema.parse(input.score);
  const response = await fetchLtiNetwork({
    operation: 'AGS score submission',
    url: `${lineItemUrl}/scores`,
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs,
    init: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        'content-type': LTI_AGS_SCORE_MEDIA_TYPE,
      },
      body: JSON.stringify(score),
    },
  });
  if (!response.ok) throwLtiHttpStatus(response, 'AGS score submission');
}
