import { z } from 'zod';
import {
  fetchLtiNetwork,
  finishLtiNetwork,
  LtiHttpError,
  readLtiJson,
  responseHasLtiMediaType,
  throwLtiHttpStatus,
} from './lti-http.server';
import {
  assertAllowedLtiServiceUrl,
  type LtiRegistration,
} from './lti-registration';
import {
  assertLtiAccessGrant,
  hasValidIsoDateTimeFields,
  type LtiAccessGrant,
} from './lti-contract.server';

export const LTI_NRPS_MEDIA_TYPE =
  'application/vnd.ims.lti-nrps.v2.membershipcontainer+json';
export const LTI_AGS_LINE_ITEM_MEDIA_TYPE =
  'application/vnd.ims.lis.v2.lineitem+json';
export const LTI_AGS_LINE_ITEM_CONTAINER_MEDIA_TYPE =
  'application/vnd.ims.lis.v2.lineitemcontainer+json';
export const LTI_AGS_SCORE_MEDIA_TYPE = 'application/vnd.ims.lis.v1.score+json';

export const LTI_SCOPES = {
  contextMembershipReadonly:
    'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
  lineItem: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  lineItemReadonly:
    'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
} as const;

function assertEnabledRegistration(registration: LtiRegistration) {
  if (!registration.enabled) throw new Error('LTI registration is disabled.');
}

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
  grant: LtiAccessGrant;
  registration: LtiRegistration;
  expectedContextId: string;
  timeoutMs?: number;
}) {
  assertEnabledRegistration(input.registration);
  const accessToken = assertLtiAccessGrant(
    input.grant,
    input.registration,
    LTI_SCOPES.contextMembershipReadonly
  );
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
      registration: input.registration,
      timeoutMs: input.timeoutMs,
      init: {
        headers: {
          accept: LTI_NRPS_MEDIA_TYPE,
          authorization: `Bearer ${accessToken}`,
        },
      },
    });
    if (!response.ok) throwLtiHttpStatus(response, 'NRPS request');
    if (!responseHasLtiMediaType(response, LTI_NRPS_MEDIA_TYPE)) {
      finishLtiNetwork(response);
      throw new Error('NRPS response used an unexpected media type.');
    }
    let page: z.infer<typeof MembershipContainerSchema>;
    try {
      page = MembershipContainerSchema.parse(
        await readLtiJson(response, 'NRPS response')
      );
    } catch (error) {
      if (error instanceof LtiHttpError) throw error;
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

function isValidIsoDate(value: string, requireSubseconds = false) {
  const pattern = requireSubseconds
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+(?:Z|[+-]\d{2}(?::\d{2})?)$/
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::\d{2})?)$/;
  return pattern.test(value) && hasValidIsoDateTimeFields(value);
}

const IsoDateSchema = z
  .string()
  .refine((value) => isValidIsoDate(value), 'Invalid ISO 8601 date-time.');
const AgsTimestampSchema = z
  .string()
  .refine(
    (value) => isValidIsoDate(value, true),
    'AGS timestamps require ISO 8601 sub-second precision and a time zone.'
  );
const LINE_ITEM_STANDARD_KEYS = new Set([
  'id',
  'scoreMaximum',
  'label',
  'resourceId',
  'resourceLinkId',
  'tag',
  'startDateTime',
  'endDateTime',
  'gradesReleased',
]);

function validateQualifiedExtensions(
  value: Record<string, unknown>,
  context: z.RefinementCtx,
  standardKeys: Set<string>
) {
  for (const key of Object.keys(value)) {
    if (standardKeys.has(key)) continue;
    try {
      new URL(key);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LTI extensions must use fully qualified URL keys.',
        path: [key],
      });
    }
  }
}

const AgsLineItemInputFields = {
  scoreMaximum: z.number().positive(),
  label: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  resourceLinkId: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  startDateTime: IsoDateSchema.nullable().optional(),
  endDateTime: IsoDateSchema.nullable().optional(),
  gradesReleased: z.boolean().nullable().optional(),
};

const AgsLineItemResponseFields = {
  scoreMaximum: z.number().positive(),
  label: z.string().min(1),
  resourceId: z.string().nullable().optional(),
  resourceLinkId: z.string().nullable().optional(),
  tag: z.string().nullable().optional(),
  startDateTime: z
    .union([IsoDateSchema, z.literal('')])
    .nullable()
    .optional(),
  endDateTime: z
    .union([IsoDateSchema, z.literal('')])
    .nullable()
    .optional(),
  gradesReleased: z.boolean().nullable().optional(),
};

const AgsLineItemSchema = z
  .object({ id: z.string().url(), ...AgsLineItemResponseFields })
  .catchall(z.unknown())
  .superRefine((value, context) =>
    validateQualifiedExtensions(value, context, LINE_ITEM_STANDARD_KEYS)
  );

const AgsLineItemInputSchema = z
  .object(AgsLineItemInputFields)
  .catchall(z.unknown())
  .superRefine((value, context) =>
    validateQualifiedExtensions(value, context, LINE_ITEM_STANDARD_KEYS)
  );

export type AgsLineItem = z.infer<typeof AgsLineItemSchema>;
export type AgsLineItemInput = z.input<typeof AgsLineItemInputSchema>;

function assertAgsServiceBinding(
  lineItemsUrl: string,
  resourceUrl: string,
  registration: LtiRegistration
) {
  const container = assertAllowedLtiServiceUrl(lineItemsUrl, registration);
  const resource = assertAllowedLtiServiceUrl(resourceUrl, registration);
  if (resource.origin !== container.origin) {
    throw new Error('AGS resource changed the advertised service origin.');
  }
  return { container, resource };
}

async function parseAgsLineItemResponse(
  response: Response,
  registration: LtiRegistration,
  expectedOrigin: string
) {
  if (!response.ok) throwLtiHttpStatus(response, 'AGS line-item request');
  if (!responseHasLtiMediaType(response, LTI_AGS_LINE_ITEM_MEDIA_TYPE)) {
    finishLtiNetwork(response);
    throw new Error('AGS line-item response used an unexpected media type.');
  }
  let lineItem: AgsLineItem;
  try {
    lineItem = AgsLineItemSchema.parse(
      await readLtiJson(response, 'AGS line-item response')
    );
  } catch (error) {
    if (error instanceof LtiHttpError) throw error;
    throw new Error('AGS line-item response did not match the contract.', {
      cause: error,
    });
  }
  const id = assertAllowedLtiServiceUrl(lineItem.id, registration);
  if (id.origin !== expectedOrigin) {
    throw new Error('AGS line-item response changed service origin.');
  }
  return lineItem;
}

export async function createAgsLineItem(input: {
  lineItemsUrl: string;
  grant: LtiAccessGrant;
  registration: LtiRegistration;
  lineItem: AgsLineItemInput;
  timeoutMs?: number;
}) {
  assertEnabledRegistration(input.registration);
  const accessToken = assertLtiAccessGrant(
    input.grant,
    input.registration,
    LTI_SCOPES.lineItem
  );
  const lineItemsUrl = assertAllowedLtiServiceUrl(
    input.lineItemsUrl,
    input.registration
  );
  const body = AgsLineItemInputSchema.parse(input.lineItem);
  const response = await fetchLtiNetwork({
    operation: 'AGS line-item create',
    url: lineItemsUrl,
    registration: input.registration,
    timeoutMs: input.timeoutMs,
    init: {
      method: 'POST',
      headers: {
        accept: LTI_AGS_LINE_ITEM_MEDIA_TYPE,
        authorization: `Bearer ${accessToken}`,
        'content-type': LTI_AGS_LINE_ITEM_MEDIA_TYPE,
      },
      body: JSON.stringify(body),
    },
  });
  return parseAgsLineItemResponse(
    response,
    input.registration,
    lineItemsUrl.origin
  );
}

export async function fetchAllAgsLineItems(input: {
  lineItemsUrl: string;
  grant: LtiAccessGrant;
  registration: LtiRegistration;
  filters?: {
    resourceLinkId?: string;
    resourceId?: string;
    tag?: string;
    limit?: number;
  };
  timeoutMs?: number;
}) {
  assertEnabledRegistration(input.registration);
  const accessToken = assertLtiAccessGrant(input.grant, input.registration, [
    LTI_SCOPES.lineItem,
    LTI_SCOPES.lineItemReadonly,
  ]);
  const initialUrl = assertAllowedLtiServiceUrl(
    input.lineItemsUrl,
    input.registration
  );
  if (input.filters?.resourceLinkId)
    initialUrl.searchParams.set(
      'resource_link_id',
      input.filters.resourceLinkId
    );
  if (input.filters?.resourceId)
    initialUrl.searchParams.set('resource_id', input.filters.resourceId);
  if (input.filters?.tag) initialUrl.searchParams.set('tag', input.filters.tag);
  if (input.filters?.limit !== undefined) {
    if (
      !Number.isSafeInteger(input.filters.limit) ||
      input.filters.limit < 1 ||
      input.filters.limit > 100
    ) {
      throw new Error('AGS line-item limit must be between 1 and 100.');
    }
    initialUrl.searchParams.set('limit', String(input.filters.limit));
  }

  const lineItems: AgsLineItem[] = [];
  const visited = new Set<string>();
  let nextUrl: string | null = initialUrl.toString();
  while (nextUrl) {
    if (visited.size >= 100 || visited.has(nextUrl)) {
      throw new Error('AGS line-item pagination loop or page limit detected.');
    }
    visited.add(nextUrl);
    const current = assertAllowedLtiServiceUrl(nextUrl, input.registration);
    if (current.origin !== initialUrl.origin) {
      throw new Error('AGS next-page URL changed service origin.');
    }
    const response = await fetchLtiNetwork({
      operation: 'AGS line-item list',
      url: current,
      registration: input.registration,
      timeoutMs: input.timeoutMs,
      init: {
        headers: {
          accept: LTI_AGS_LINE_ITEM_CONTAINER_MEDIA_TYPE,
          authorization: `Bearer ${accessToken}`,
        },
      },
    });
    if (!response.ok) throwLtiHttpStatus(response, 'AGS line-item list');
    if (
      !responseHasLtiMediaType(response, LTI_AGS_LINE_ITEM_CONTAINER_MEDIA_TYPE)
    ) {
      finishLtiNetwork(response);
      throw new Error('AGS line-item list used an unexpected media type.');
    }
    let page: AgsLineItem[];
    try {
      page = z
        .array(AgsLineItemSchema)
        .parse(await readLtiJson(response, 'AGS line-item list'));
    } catch (error) {
      if (error instanceof LtiHttpError) throw error;
      throw new Error('AGS line-item list did not match the contract.', {
        cause: error,
      });
    }
    for (const lineItem of page) {
      const id = assertAllowedLtiServiceUrl(lineItem.id, input.registration);
      if (id.origin !== initialUrl.origin) {
        throw new Error('AGS line-item list changed service origin.');
      }
      lineItems.push(lineItem);
    }
    nextUrl = parseNextLink(response.headers.get('link'), current);
  }
  return lineItems;
}

export async function getAgsLineItem(input: {
  lineItemsUrl: string;
  lineItemUrl: string;
  grant: LtiAccessGrant;
  registration: LtiRegistration;
  timeoutMs?: number;
}) {
  assertEnabledRegistration(input.registration);
  const accessToken = assertLtiAccessGrant(input.grant, input.registration, [
    LTI_SCOPES.lineItem,
    LTI_SCOPES.lineItemReadonly,
  ]);
  const { container, resource } = assertAgsServiceBinding(
    input.lineItemsUrl,
    input.lineItemUrl,
    input.registration
  );
  const response = await fetchLtiNetwork({
    operation: 'AGS line-item read',
    url: resource,
    registration: input.registration,
    timeoutMs: input.timeoutMs,
    init: {
      headers: {
        accept: LTI_AGS_LINE_ITEM_MEDIA_TYPE,
        authorization: `Bearer ${accessToken}`,
      },
    },
  });
  return parseAgsLineItemResponse(
    response,
    input.registration,
    container.origin
  );
}

export async function updateAgsLineItem(input: {
  lineItemsUrl: string;
  lineItemUrl: string;
  grant: LtiAccessGrant;
  registration: LtiRegistration;
  lineItem: z.input<typeof AgsLineItemSchema>;
  timeoutMs?: number;
}) {
  assertEnabledRegistration(input.registration);
  const accessToken = assertLtiAccessGrant(
    input.grant,
    input.registration,
    LTI_SCOPES.lineItem
  );
  const { container, resource } = assertAgsServiceBinding(
    input.lineItemsUrl,
    input.lineItemUrl,
    input.registration
  );
  const parsed = AgsLineItemSchema.parse(input.lineItem);
  if (parsed.id !== resource.toString()) {
    throw new Error('AGS line-item update cannot change the immutable id.');
  }
  const { id: _id, ...body } = parsed;
  const response = await fetchLtiNetwork({
    operation: 'AGS line-item update',
    url: resource,
    registration: input.registration,
    timeoutMs: input.timeoutMs,
    init: {
      method: 'PUT',
      headers: {
        accept: LTI_AGS_LINE_ITEM_MEDIA_TYPE,
        authorization: `Bearer ${accessToken}`,
        'content-type': LTI_AGS_LINE_ITEM_MEDIA_TYPE,
      },
      body: JSON.stringify(body),
    },
  });
  const updated = await parseAgsLineItemResponse(
    response,
    input.registration,
    container.origin
  );
  if (
    updated.id !== parsed.id ||
    (parsed.resourceLinkId !== undefined &&
      updated.resourceLinkId !== parsed.resourceLinkId)
  ) {
    throw new Error('AGS line-item update changed immutable identifiers.');
  }
  return updated;
}

const ScoreSubmissionSchema = z
  .object({
    startedAt: AgsTimestampSchema.optional(),
    submittedAt: AgsTimestampSchema.optional(),
  })
  .strict()
  .superRefine((submission, context) => {
    if (
      submission.startedAt &&
      submission.submittedAt &&
      Date.parse(submission.submittedAt.replace(/([+-]\d{2})$/, '$1:00')) <
        Date.parse(submission.startedAt.replace(/([+-]\d{2})$/, '$1:00'))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AGS submittedAt must not precede startedAt.',
        path: ['submittedAt'],
      });
    }
  });

const SCORE_STANDARD_KEYS = new Set([
  'userId',
  'scoreGiven',
  'scoreMaximum',
  'activityProgress',
  'gradingProgress',
  'timestamp',
  'comment',
  'scoringUserId',
  'submission',
]);

export const AgsScoreSchema = z
  .object({
    userId: z.string().min(1),
    scoreGiven: z.number().nonnegative().nullable().optional(),
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
    timestamp: AgsTimestampSchema,
    comment: z.string().nullable().optional(),
    scoringUserId: z.string().min(1).optional(),
    submission: ScoreSubmissionSchema.optional(),
  })
  .catchall(z.unknown())
  .superRefine((score, context) => {
    validateQualifiedExtensions(score, context, SCORE_STANDARD_KEYS);
    if (
      typeof score.scoreGiven === 'number' &&
      score.scoreMaximum === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AGS scoreMaximum is required when scoreGiven is present.',
        path: ['scoreMaximum'],
      });
    }
  });

export async function submitAgsScore(input: {
  lineItemsUrl: string;
  lineItemUrl: string;
  grant: LtiAccessGrant;
  registration: LtiRegistration;
  score: z.input<typeof AgsScoreSchema>;
  timeoutMs?: number;
}) {
  assertEnabledRegistration(input.registration);
  const accessToken = assertLtiAccessGrant(
    input.grant,
    input.registration,
    LTI_SCOPES.score
  );
  const { resource } = assertAgsServiceBinding(
    input.lineItemsUrl,
    input.lineItemUrl,
    input.registration
  );
  const score = AgsScoreSchema.parse(input.score);
  const scoreUrl = new URL(resource);
  scoreUrl.pathname = `${scoreUrl.pathname.replace(/\/$/, '')}/scores`;
  assertAllowedLtiServiceUrl(scoreUrl.toString(), input.registration);
  const response = await fetchLtiNetwork({
    operation: 'AGS score submission',
    url: scoreUrl,
    registration: input.registration,
    timeoutMs: input.timeoutMs,
    init: {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': LTI_AGS_SCORE_MEDIA_TYPE,
      },
      body: JSON.stringify(score),
    },
  });
  if (!response.ok) throwLtiHttpStatus(response, 'AGS score submission');
  finishLtiNetwork(response);
}
