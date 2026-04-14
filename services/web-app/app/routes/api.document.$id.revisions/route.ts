import crypto from 'node:crypto';
import { invariant } from '@epic-web/invariant';
import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

function hashContent(html: string, text: string): string {
  return crypto.createHash('md5').update(`${html}|${text}`).digest('hex');
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  invariant(params.id, 'No document id provided');

  const userId = await requireUserId(request);
  await requireProfile(request, userId);

  const url = new URL(request.url);
  const before = url.searchParams.get('before'); // ISO timestamp cursor
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '10')));
  const beforeDate = before ? new Date(before) : undefined;

  const dateFilter = beforeDate ? { lt: beforeDate } : undefined;

  // Fetch revisions and write journals in parallel
  const [revisions, journals] = await Promise.all([
    prisma.documentRevision.findMany({
      where: {
        documentId: params.id,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 3, // over-fetch to account for dedup
      select: {
        id: true,
        createdAt: true,
        trigger: true,
        html: true,
        text: true,
      },
    }),
    prisma.documentWriteJournal.findMany({
      where: {
        documentId: params.id,
        status: 'accepted',
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 3,
      select: {
        id: true,
        createdAt: true,
        eventType: true,
        source: true,
        html: true,
        text: true,
        htmlHash: true,
      },
    }),
  ]);

  // Merge and deduplicate by content hash
  type HistoryEntry = {
    id: string;
    createdAt: string;
    label: string;
    html: string;
    text: string;
    source: 'revision' | 'journal';
  };

  const seen = new Set<string>();
  const all: HistoryEntry[] = [];

  // Add revisions first (canonical snapshots)
  for (const rev of revisions) {
    const hash = hashContent(rev.html, rev.text);
    if (seen.has(hash)) continue;
    seen.add(hash);
    all.push({
      id: rev.id,
      createdAt: rev.createdAt instanceof Date ? rev.createdAt.toISOString() : String(rev.createdAt),
      label: rev.trigger === 'submit' ? 'Submitted' : 'Auto-saved',
      html: rev.html,
      text: rev.text,
      source: 'revision',
    });
  }

  // Add journals that aren't duplicates
  for (const j of journals) {
    const hash = j.htmlHash || hashContent(j.html, j.text);
    if (seen.has(hash)) continue;
    seen.add(hash);
    const label =
      j.eventType === 'document.submit' ? 'Submitted' :
      j.source === 'tutor-pre-respond' ? 'Before tutor response' :
      j.source === 'pre-submit-flush' ? 'Before submit' :
      'Saved';
    all.push({
      id: j.id,
      createdAt: j.createdAt instanceof Date ? j.createdAt.toISOString() : String(j.createdAt),
      label,
      html: j.html,
      text: j.text,
      source: 'journal',
    });
  }

  // Sort by date descending, take `limit`
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const page = all.slice(0, limit);
  const nextCursor = page.length === limit ? page[page.length - 1].createdAt : null;

  return dataResponse({ entries: page, nextCursor });
};
