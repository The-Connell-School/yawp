import { z } from 'zod';
import { LtiNetworkUrlSchema } from './lti-registration';

export const LTI_NRPS_MEDIA_TYPE =
  'application/vnd.ims.lti-nrps.v2.membershipcontainer+json';

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
  roles: z.array(z.string().min(1)).min(1),
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

function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const match = part.match(/^\s*<([^>]+)>\s*;\s*rel="?next"?\s*$/i);
    if (match) return match[1];
  }
  return null;
}

export async function fetchAllNrpsMemberships(input: {
  membershipsUrl: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}) {
  const initialUrl = new URL(LtiNetworkUrlSchema.parse(input.membershipsUrl));
  let nextUrl: string | null = initialUrl.toString();
  let context: z.infer<typeof ContextSchema> | null = null;
  const members: z.infer<typeof MemberSchema>[] = [];
  const visited = new Set<string>();

  while (nextUrl) {
    if (visited.size >= 100 || visited.has(nextUrl)) {
      throw new Error('NRPS pagination loop or page limit detected.');
    }
    visited.add(nextUrl);
    const current = new URL(LtiNetworkUrlSchema.parse(nextUrl));
    if (current.origin !== initialUrl.origin) {
      throw new Error('NRPS next-page URL changed service origin.');
    }

    const response = await (input.fetchImpl ?? fetch)(current, {
      headers: {
        accept: LTI_NRPS_MEDIA_TYPE,
        authorization: `Bearer ${input.accessToken}`,
      },
    });
    if (!response.ok) {
      throw new Error(`NRPS request returned HTTP ${response.status}.`);
    }
    let page: z.infer<typeof MembershipContainerSchema>;
    try {
      page = MembershipContainerSchema.parse(await response.json());
    } catch (error) {
      throw new Error('NRPS response did not match the membership contract.', {
        cause: error,
      });
    }
    if (context && page.context.id !== context.id) {
      throw new Error('NRPS pagination changed context id.');
    }
    context = page.context;
    members.push(...page.members);
    nextUrl = parseNextLink(response.headers.get('link'));
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
  id: LtiNetworkUrlSchema,
  scoreMaximum: z.number().positive(),
  label: z.string().min(1),
  resourceId: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  startDateTime: z.string().datetime().optional(),
  endDateTime: z.string().datetime().optional(),
});

export type AgsLineItemInput = Omit<z.input<typeof AgsLineItemSchema>, 'id'>;

export async function createAgsLineItem(input: {
  lineItemsUrl: string;
  accessToken: string;
  lineItem: AgsLineItemInput;
  fetchImpl?: typeof fetch;
}) {
  const lineItemsUrl = LtiNetworkUrlSchema.parse(input.lineItemsUrl);
  const body = AgsLineItemSchema.omit({ id: true }).parse(input.lineItem);
  const response = await (input.fetchImpl ?? fetch)(lineItemsUrl, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.ims.lis.v2.lineitem+json',
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/vnd.ims.lis.v2.lineitem+json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`AGS line-item request returned HTTP ${response.status}.`);
  }
  try {
    return AgsLineItemSchema.parse(await response.json());
  } catch (error) {
    throw new Error('AGS line-item response did not match the contract.', {
      cause: error,
    });
  }
}

const AgsScoreSchema = z.object({
  userId: z.string().min(1),
  scoreGiven: z.number().finite(),
  scoreMaximum: z.number().positive(),
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
});

export async function submitAgsScore(input: {
  lineItemUrl: string;
  accessToken: string;
  idempotencyKey: string;
  score: z.input<typeof AgsScoreSchema>;
  fetchImpl?: typeof fetch;
}) {
  const lineItemUrl = LtiNetworkUrlSchema.parse(input.lineItemUrl).replace(
    /\/$/,
    ''
  );
  if (!input.idempotencyKey) {
    throw new Error('AGS score submission requires an idempotency key.');
  }
  const response = await (input.fetchImpl ?? fetch)(`${lineItemUrl}/scores`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      'content-type': 'application/vnd.ims.lis.v1.score+json',
      'idempotency-key': input.idempotencyKey,
    },
    body: JSON.stringify(AgsScoreSchema.parse(input.score)),
  });
  if (!response.ok) {
    throw new Error(`AGS score request returned HTTP ${response.status}.`);
  }
}
