import * as React from 'react';
import {
  Link,
  useFetcher,
  useLoaderData,
  useSearchParams,
  type LoaderFunctionArgs,
} from 'react-router';
import {
  Check,
  ChevronLeft,
  Database,
  Loader2,
  Pencil,
  Plus,
  Save,
  Send,
  X,
} from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { cn } from '~/utils/misc';
import { prisma } from '~/utils/db.server';
import { requireSeedGeneratorAccess } from '~/utils/admin-seed-generator/seed-generator-access.server';
import { loadSeedGeneratorOrganizationContext } from '~/domain/admin-seed-generator/seed-generator-context.server';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type ReviewStatus = 'proposed' | 'approved' | 'rejected' | 'committed';
type NodeKind = 'class' | 'assignment' | 'student' | 'document' | 'submission';
type SeedNode = {
  id?: string;
  localId: string;
  kind: NodeKind;
  parentLocalId: string | null;
  status: ReviewStatus;
  committedEntityId: string | null;
  data: Record<string, unknown>;
};

type SeedError = { type: 'transient' | 'unparseable'; message: string };
type SeedActionData = {
  conversationId?: string;
  reply?: string;
  nodes?: SeedNode[];
  error?: SeedError;
  isNewConversation?: boolean;
  cascadedLocalIds?: string[];
  summary?: {
    classesCreated: number;
    assignmentsCreated: number;
    studentsCreated: number;
    documentsCreated: number;
    submissionsCreated: number;
    skippedStudents: Array<{ name: string; reason: string }>;
  };
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const access = await requireSeedGeneratorAccess(request);
  const organizationId = params.id;
  if (!organizationId) throw new Response('Not found', { status: 404 });
  const context = await loadSeedGeneratorOrganizationContext(organizationId);
  const selectedId = new URL(request.url).searchParams.get('c');
  const conversations = await prisma.seedGeneratorConversation.findMany({
    where: {
      membershipId: access.membership.id,
      organizationId,
      deletedAt: null,
    },
    select: { id: true, title: true },
    orderBy: { updatedAt: 'desc' },
    take: 30,
  });
  const selected = selectedId
    ? await prisma.seedGeneratorConversation.findFirst({
        where: {
          id: selectedId,
          membershipId: access.membership.id,
          organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          messages: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { role: true, content: true },
          },
          nodes: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              localId: true,
              kind: true,
              parentLocalId: true,
              status: true,
              data: true,
              committedEntityId: true,
            },
          },
        },
      })
    : null;
  return {
    organization: {
      id: context.organizationId,
      name: context.organizationName,
    },
    existingClasses: context.existingClasses,
    conversations,
    selectedConversation: selected
      ? {
          id: selected.id,
          title: selected.title,
          messages: selected.messages as ChatMessage[],
          nodes: selected.nodes.map((node) => ({
            ...node,
            kind: node.kind as NodeKind,
            status: node.status as ReviewStatus,
            data: node.data as Record<string, unknown>,
          })),
        }
      : null,
  };
}

const ACTION = '/app/api/domain/seed-generator';

function statusVariant(status: ReviewStatus) {
  if (status === 'approved' || status === 'committed')
    return 'success' as const;
  if (status === 'rejected') return 'destructive' as const;
  return 'secondary' as const;
}

function nodeSummary(node: SeedNode) {
  if (node.kind === 'class') return String(node.data.title ?? 'Untitled class');
  if (node.kind === 'assignment')
    return String(node.data.title ?? 'Untitled assignment');
  if (node.kind === 'student')
    return String(node.data.name ?? 'Unnamed student');
  if (node.kind === 'document')
    return String(node.data.title ?? 'Untitled document');
  const workflow = String(node.data.status ?? 'submitted');
  const grade = node.data.grade as Record<string, unknown> | undefined;
  return grade?.letterGrade
    ? `${workflow} · ${String(grade.letterGrade)}`
    : workflow;
}

function asSeedNodes(value: SeedActionData['nodes']) {
  return value ?? [];
}

function newestUserMessage(messages: ChatMessage[]) {
  return (
    [...messages].reverse().find((message) => message.role === 'user')
      ?.content ?? ''
  );
}

export function committableNodeIds(nodes: SeedNode[]) {
  const byId = new Map(nodes.map((node) => [node.localId, node]));
  const included = new Set(
    nodes
      .filter((node) => node.status === 'approved' && node.kind === 'class')
      .map((node) => node.localId)
  );
  for (const assignment of nodes.filter(
    (node) => node.kind === 'assignment' && node.status === 'approved'
  )) {
    const parent = assignment.parentLocalId
      ? byId.get(assignment.parentLocalId)
      : null;
    if (
      !parent ||
      parent.status === 'approved' ||
      parent.status === 'committed'
    ) {
      included.add(assignment.localId);
    }
  }
  for (const submission of nodes.filter(
    (node) => node.kind === 'submission' && node.status === 'approved'
  )) {
    const document = submission.parentLocalId
      ? byId.get(submission.parentLocalId)
      : null;
    const assignment = document?.parentLocalId
      ? byId.get(document.parentLocalId)
      : null;
    const student =
      document?.kind === 'document' &&
      typeof document.data.studentLocalId === 'string'
        ? byId.get(document.data.studentLocalId)
        : null;
    if (
      document?.kind !== 'document' ||
      document.status !== 'approved' ||
      !assignment ||
      (assignment.status !== 'committed' &&
        !included.has(assignment.localId)) ||
      !student ||
      (student.status !== 'approved' && student.status !== 'committed') ||
      assignment.parentLocalId !== student.parentLocalId
    ) {
      continue;
    }
    const studentClass = student.parentLocalId
      ? byId.get(student.parentLocalId)
      : null;
    if (
      studentClass &&
      studentClass.status !== 'approved' &&
      studentClass.status !== 'committed'
    ) {
      continue;
    }
    included.add(submission.localId);
    included.add(document.localId);
    if (student.status === 'approved') included.add(student.localId);
  }
  return included;
}

export default function SeedGeneratorRoute() {
  const { organization, existingClasses, conversations, selectedConversation } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const messageFetcher = useFetcher<SeedActionData>();
  const mutationFetcher = useFetcher<SeedActionData>();
  const commitFetcher = useFetcher<SeedActionData>();
  const [messages, setMessages] = React.useState<ChatMessage[]>(
    selectedConversation?.messages ?? []
  );
  const [nodes, setNodes] = React.useState<SeedNode[]>(
    (selectedConversation?.nodes as SeedNode[] | undefined) ?? []
  );
  const [message, setMessage] = React.useState('');
  const [lastMessage, setLastMessage] = React.useState(() =>
    newestUserMessage(selectedConversation?.messages ?? [])
  );
  const [pendingConversationId, setPendingConversationId] = React.useState<
    string | null
  >(null);
  const processedMessageData = React.useRef<SeedActionData | null>(null);
  const processedMutationData = React.useRef<SeedActionData | null>(null);
  const processedCommitData = React.useRef<SeedActionData | null>(null);
  const messageOrigin = React.useRef<string | null>(null);
  const mutationOrigin = React.useRef<string | null>(null);
  const commitOrigin = React.useRef<string | null>(null);
  const conversationId = selectedConversation?.id ?? pendingConversationId;

  React.useEffect(() => {
    setPendingConversationId(null);
    setMessages(selectedConversation?.messages ?? []);
    setNodes((selectedConversation?.nodes as SeedNode[] | undefined) ?? []);
    setLastMessage(newestUserMessage(selectedConversation?.messages ?? []));
  }, [selectedConversation?.id]);

  React.useEffect(() => {
    const result = messageFetcher.data;
    if (
      messageFetcher.state !== 'idle' ||
      !result ||
      processedMessageData.current === result
    )
      return;
    processedMessageData.current = result;
    if (messageOrigin.current !== (conversationId ?? null)) return;
    if (result.error) return;
    if (result.reply) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: result.reply! },
      ]);
    }
    if (result.nodes) setNodes((current) => [...current, ...result.nodes!]);
    if (result.conversationId && !conversationId) {
      setPendingConversationId(result.conversationId);
      const next = new URLSearchParams(searchParams);
      next.set('c', result.conversationId);
      setSearchParams(next, { replace: true });
    }
  }, [
    conversationId,
    messageFetcher.data,
    messageFetcher.state,
    searchParams,
    setSearchParams,
  ]);

  React.useEffect(() => {
    const result = mutationFetcher.data;
    if (
      mutationFetcher.state !== 'idle' ||
      !result ||
      processedMutationData.current === result
    )
      return;
    processedMutationData.current = result;
    if (mutationOrigin.current !== (conversationId ?? null)) return;
    if (result.nodes) setNodes(asSeedNodes(result.nodes));
  }, [mutationFetcher.data, mutationFetcher.state]);

  React.useEffect(() => {
    const result = commitFetcher.data;
    if (
      commitFetcher.state !== 'idle' ||
      !result ||
      processedCommitData.current === result
    )
      return;
    processedCommitData.current = result;
    if (commitOrigin.current !== (conversationId ?? null)) return;
    if (result.nodes) setNodes(asSeedNodes(result.nodes));
  }, [commitFetcher.data, commitFetcher.state]);

  const busy =
    messageFetcher.state !== 'idle' ||
    mutationFetcher.state !== 'idle' ||
    commitFetcher.state !== 'idle';

  function send(nextMessage: string, optimistic = true) {
    const trimmed = nextMessage.trim();
    if (!trimmed || messageFetcher.state !== 'idle') return;
    setLastMessage(trimmed);
    if (optimistic) {
      setMessages((current) => [
        ...current,
        { role: 'user', content: trimmed },
      ]);
    }
    setMessage('');
    messageOrigin.current = conversationId ?? null;
    messageFetcher.submit(
      {
        intent: 'message',
        organizationId: organization.id,
        message: trimmed,
        ...(conversationId ? { conversationId } : {}),
      },
      { method: 'post', action: ACTION }
    );
  }

  function mutateNode(
    localId: string,
    options: {
      status?: ReviewStatus;
      dataPatch?: Record<string, unknown>;
      reject?: boolean;
    }
  ) {
    if (!conversationId) return;
    mutationOrigin.current = conversationId;
    mutationFetcher.submit(
      {
        intent: options.reject ? 'delete-node' : 'edit-node',
        organizationId: organization.id,
        conversationId,
        localId,
        ...(options.status ? { status: options.status } : {}),
        ...(options.dataPatch
          ? { dataPatch: JSON.stringify(options.dataPatch) }
          : {}),
      },
      { method: 'post', action: ACTION }
    );
  }

  function submitCommit() {
    if (!conversationId || commitFetcher.state !== 'idle') return;
    commitOrigin.current = conversationId;
    commitFetcher.submit(
      {
        intent: 'commit-node',
        organizationId: organization.id,
        conversationId,
      },
      { method: 'post', action: ACTION }
    );
  }

  const rawApprovedCount = nodes.filter(
    (node) => node.status === 'approved'
  ).length;
  const approvedCount = committableNodeIds(nodes).size;

  return (
    <div className="flex min-h-0 w-full flex-col overflow-x-hidden lg:h-full lg:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-secondary/40 lg:flex">
        <ThreadList
          conversations={conversations}
          conversationId={conversationId}
          searchParams={searchParams}
          setSearchParams={setSearchParams}
          onNew={() => {
            setPendingConversationId(null);
            setMessages([]);
            setNodes([]);
            setLastMessage('');
          }}
          disabled={busy}
        />
      </aside>

      <main className="min-w-0 flex-1">
        <header className="border-b bg-secondary px-4 py-3 md:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/app/admin/organizations/${organization.id}`}>
                <ChevronLeft size={16} />
                Organization
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold">
                Seed data generator
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {organization.name} · review every entity before writing
              </p>
            </div>
            <div className="flex items-center gap-2 lg:hidden">
              <label className="sr-only" htmlFor="seed-thread-mobile">
                Seed plans
              </label>
              <select
                id="seed-thread-mobile"
                value={conversationId ?? ''}
                disabled={busy}
                onChange={(event) => {
                  if (!event.target.value) return;
                  const next = new URLSearchParams(searchParams);
                  next.set('c', event.target.value);
                  setSearchParams(next);
                }}
                className="h-9 max-w-40 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Past plans</option>
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
              <Button
                size="icon"
                variant="outline"
                disabled={busy}
                aria-label="New seed plan"
                onClick={() => {
                  setPendingConversationId(null);
                  setMessages([]);
                  setNodes([]);
                  setLastMessage('');
                  const next = new URLSearchParams(searchParams);
                  next.delete('c');
                  setSearchParams(next);
                }}
              >
                <Plus size={16} />
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl gap-4 p-4 md:p-6 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.6fr)]">
          <Card className="min-w-0 self-start">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database size={18} />
                Instructions
              </CardTitle>
              <CardDescription>
                The first pass builds relationships only. Essay content loads
                when you expand a submission or commit the graph.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {messages.length > 0 ? (
                <div
                  className="max-h-72 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-3"
                  aria-label="Conversation history"
                >
                  {messages.map((item, index) => (
                    <div
                      key={`${item.role}-${index}`}
                      className={cn('rounded-lg px-3 py-2 text-sm', {
                        'ml-6 bg-primary text-primary-foreground':
                          item.role === 'user',
                        'mr-6 border bg-background': item.role === 'assistant',
                      })}
                    >
                      {item.content}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  Try “Create an English 9 class with one assignment and two
                  students. One turned in an essay that is not yet graded.”
                </p>
              )}

              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  send(message);
                }}
              >
                <Label htmlFor="seed-message">Describe demo data</Label>
                <Textarea
                  id="seed-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                  maxLength={4_000}
                  placeholder="Add a student and an ungraded submission…"
                  disabled={messageFetcher.state !== 'idle'}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!message.trim() || messageFetcher.state !== 'idle'}
                >
                  {messageFetcher.state !== 'idle' ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <Send size={16} />
                  )}
                  {conversationId ? 'Add to graph' : 'Generate graph'}
                </Button>
              </form>

              {messageFetcher.data?.error ? (
                <div
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                  role="alert"
                >
                  <p className="text-sm text-destructive">
                    {messageFetcher.data.error.message}
                  </p>
                  {messageFetcher.data.error.type === 'transient' &&
                  lastMessage ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => send(lastMessage, false)}
                    >
                      Retry
                    </Button>
                  ) : null}
                  {messageFetcher.data.error.type === 'unparseable' &&
                  lastMessage ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setMessage(lastMessage);
                        document.getElementById('seed-message')?.focus();
                      }}
                    >
                      Edit and rephrase
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {mutationFetcher.data?.error ? (
                <div
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                  role="alert"
                >
                  <p className="text-sm text-destructive">
                    {mutationFetcher.data.error.message}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => window.location.reload()}
                  >
                    Reload plan
                  </Button>
                </div>
              ) : null}
              {commitFetcher.data?.error ? (
                <div
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                  role="alert"
                >
                  <p className="text-sm text-destructive">
                    {commitFetcher.data.error.message}
                  </p>
                  {commitFetcher.data.error.type === 'transient' ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={submitCommit}
                    >
                      Retry commit
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {commitFetcher.data?.summary ? (
                <div
                  className="rounded-lg border border-green-600/25 bg-green-600/5 p-3 text-sm"
                  role="status"
                  aria-live="polite"
                >
                  Created {commitFetcher.data.summary.classesCreated} classes,{' '}
                  {commitFetcher.data.summary.assignmentsCreated} assignments,{' '}
                  {commitFetcher.data.summary.studentsCreated} students, and{' '}
                  {commitFetcher.data.summary.submissionsCreated} submissions.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <section
            className="min-w-0 space-y-3"
            aria-labelledby="entity-graph-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="entity-graph-heading" className="text-lg font-semibold">
                  Entity graph
                </h2>
                <p className="text-sm text-muted-foreground">
                  Class → assignment → student → document → submission
                </p>
              </div>
              <Button
                type="button"
                disabled={!conversationId || approvedCount === 0 || busy}
                onClick={submitCommit}
              >
                {commitFetcher.state !== 'idle' ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Save size={16} />
                )}
                Commit {approvedCount} approved
              </Button>
            </div>
            {rawApprovedCount > approvedCount ? (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {rawApprovedCount - approvedCount} approved{' '}
                {rawApprovedCount - approvedCount === 1
                  ? 'node is'
                  : 'nodes are'}{' '}
                waiting for an approved submission and its dependency chain.
              </p>
            ) : null}
            {messageFetcher.state !== 'idle' ? (
              <div
                className="flex items-center gap-2 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="animate-spin" size={16} />
                Building the structural graph…
              </div>
            ) : null}
            {nodes.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  The proposed entity relationships will appear here.
                </CardContent>
              </Card>
            ) : (
              <SeedGraph
                key={conversationId}
                nodes={nodes}
                existingClasses={existingClasses}
                disabled={busy}
                organizationId={organization.id}
                conversationId={conversationId!}
                onMutate={mutateNode}
                onNodes={setNodes}
                onEditInstructions={() => {
                  setMessage(lastMessage);
                  requestAnimationFrame(() =>
                    document.getElementById('seed-message')?.focus()
                  );
                }}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function ThreadList({
  conversations,
  conversationId,
  searchParams,
  setSearchParams,
  onNew,
  disabled,
}: {
  conversations: Array<{ id: string; title: string }>;
  conversationId: string | null | undefined;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  onNew: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          aria-label="New seed plan"
          disabled={disabled}
          onClick={() => {
            onNew();
            const next = new URLSearchParams(searchParams);
            next.delete('c');
            setSearchParams(next);
          }}
        >
          <Plus size={16} /> New seed plan
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="Seed plans">
        {conversations.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            Saved seed plans will appear here.
          </p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('c', conversation.id);
                    setSearchParams(next);
                  }}
                  className={cn(
                    'w-full truncate rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
                    {
                      'bg-primary/10 text-primary hover:bg-primary/10':
                        conversation.id === conversationId,
                    }
                  )}
                >
                  {conversation.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </>
  );
}

function SeedGraph({
  nodes,
  existingClasses,
  disabled,
  organizationId,
  conversationId,
  onMutate,
  onNodes,
  onEditInstructions,
}: {
  nodes: SeedNode[];
  existingClasses: Array<{
    id: string;
    title: string | null;
    grade: string;
    period: string;
  }>;
  disabled: boolean;
  organizationId: string;
  conversationId: string;
  onMutate: (
    localId: string,
    options: {
      status?: ReviewStatus;
      dataPatch?: Record<string, unknown>;
      reject?: boolean;
    }
  ) => void;
  onNodes: (nodes: SeedNode[]) => void;
  onEditInstructions: () => void;
}) {
  const classes = nodes.filter((node) => node.kind === 'class');
  const classIds = new Set(classes.map((node) => node.localId));
  const referencedExistingClasses = existingClasses.filter(
    (klass) =>
      !classIds.has(klass.id) &&
      nodes.some(
        (node) =>
          (node.kind === 'assignment' || node.kind === 'student') &&
          node.parentLocalId === klass.id
      )
  );
  const classRoots: Array<
    | SeedNode
    | { localId: string; data: Record<string, unknown>; existing: true }
  > = [
    ...classes,
    ...referencedExistingClasses.map((klass) => ({
      localId: klass.id,
      data: {
        title: klass.title ?? `Grade ${klass.grade} · Period ${klass.period}`,
      },
      existing: true as const,
    })),
  ];

  return (
    <ul className="space-y-3" aria-label="Seed entity graph">
      {classRoots.map((klass) => {
        const assignments = nodes.filter(
          (node) =>
            node.kind === 'assignment' && node.parentLocalId === klass.localId
        );
        const students = nodes.filter(
          (node) =>
            node.kind === 'student' && node.parentLocalId === klass.localId
        );
        return (
          <li key={klass.localId}>
            <div className="rounded-xl border bg-card p-3 shadow-sm">
              {'existing' in klass ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline">existing class</Badge>
                  <span className="font-medium">
                    {String(klass.data.title)}
                  </span>
                </div>
              ) : (
                <NodeCard
                  node={klass}
                  disabled={disabled}
                  onMutate={onMutate}
                />
              )}
              <ul className="mt-3 space-y-3 border-l pl-3 sm:pl-5">
                {assignments.map((assignment) => {
                  const documents = nodes.filter(
                    (node) =>
                      node.kind === 'document' &&
                      node.parentLocalId === assignment.localId
                  );
                  return (
                    <li key={assignment.localId}>
                      <NodeCard
                        node={assignment}
                        disabled={disabled}
                        onMutate={onMutate}
                      />
                      <ul className="mt-2 space-y-2 border-l pl-3 sm:pl-5">
                        {documents.map((document) => {
                          const student = students.find(
                            (item) =>
                              item.localId === document.data.studentLocalId
                          );
                          const submissions = nodes.filter(
                            (node) =>
                              node.kind === 'submission' &&
                              node.parentLocalId === document.localId
                          );
                          return (
                            <li key={document.localId} className="space-y-2">
                              {student ? (
                                <NodeCard
                                  node={student}
                                  disabled={disabled}
                                  onMutate={onMutate}
                                />
                              ) : null}
                              <div className="ml-2 border-l pl-3 sm:ml-4 sm:pl-5">
                                <NodeCard
                                  node={document}
                                  disabled={disabled}
                                  onMutate={onMutate}
                                />
                                <ul className="mt-2 space-y-2 border-l pl-3 sm:pl-5">
                                  {submissions.map((submission) => (
                                    <li key={submission.localId}>
                                      <NodeCard
                                        node={submission}
                                        disabled={disabled}
                                        onMutate={onMutate}
                                      >
                                        <SubmissionContent
                                          node={submission}
                                          organizationId={organizationId}
                                          conversationId={conversationId}
                                          onNodes={onNodes}
                                          onEditInstructions={
                                            onEditInstructions
                                          }
                                        />
                                      </NodeCard>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
                {students
                  .filter(
                    (student) =>
                      !nodes.some(
                        (node) =>
                          node.kind === 'document' &&
                          node.data.studentLocalId === student.localId
                      )
                  )
                  .map((student) => (
                    <li key={student.localId}>
                      <NodeCard
                        node={student}
                        disabled={disabled}
                        onMutate={onMutate}
                      />
                    </li>
                  ))}
              </ul>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function NodeCard({
  node,
  disabled,
  onMutate,
  children,
}: {
  node: SeedNode;
  disabled: boolean;
  onMutate: (
    localId: string,
    options: {
      status?: ReviewStatus;
      dataPatch?: Record<string, unknown>;
      reject?: boolean;
    }
  ) => void;
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = React.useState(false);
  const [primary, setPrimary] = React.useState(nodeSummary(node));
  const [workflowStatus, setWorkflowStatus] = React.useState(
    String(node.data.status ?? 'submitted')
  );
  const grade = node.data.grade as Record<string, unknown> | undefined;
  const [numericPercentage, setNumericPercentage] = React.useState(
    String(grade?.numericPercentage ?? '')
  );
  const [letterGrade, setLetterGrade] = React.useState(
    String(grade?.letterGrade ?? '')
  );
  const immutable = node.status === 'committed';

  function saveEdit() {
    let dataPatch: Record<string, unknown>;
    if (
      node.kind === 'class' ||
      node.kind === 'assignment' ||
      node.kind === 'document'
    ) {
      dataPatch = { title: primary };
    } else if (node.kind === 'student') {
      dataPatch = { name: primary };
    } else {
      dataPatch = { status: workflowStatus };
      if (workflowStatus === 'graded' && numericPercentage && letterGrade) {
        dataPatch.grade = {
          ...(grade ?? {}),
          numericPercentage: Number(numericPercentage),
          letterGrade,
          overallScore: Number(grade?.overallScore ?? 3),
          overallComment: String(
            grade?.overallComment ?? 'Generated demo grade.'
          ),
          rubricScores: grade?.rubricScores ?? {},
          released: Boolean(grade?.released ?? false),
        };
      }
    }
    onMutate(node.localId, { dataPatch });
    setEditing(false);
  }

  return (
    <div
      className={cn('min-w-0 rounded-lg border bg-background p-3', {
        'border-dashed opacity-60': node.status === 'rejected',
      })}
      data-node-kind={node.kind}
      data-node-status={node.status}
    >
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {node.kind}
            </Badge>
            <Badge variant={statusVariant(node.status)}>{node.status}</Badge>
          </div>
          <p className="mt-1 break-words text-sm font-medium">
            {nodeSummary(node)}
          </p>
          {node.status === 'rejected' ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Excluded from commit. Rejected parents also reject their
              descendants.
            </p>
          ) : null}
        </div>
        {!immutable ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Edit ${node.kind} ${nodeSummary(node)}`}
              disabled={disabled}
              onClick={() => setEditing((value) => !value)}
            >
              <Pencil size={15} />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Approve ${node.kind} ${nodeSummary(node)}`}
              disabled={disabled || node.status === 'approved'}
              onClick={() => onMutate(node.localId, { status: 'approved' })}
            >
              <Check size={16} />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Reject ${node.kind} ${nodeSummary(node)}`}
              disabled={disabled || node.status === 'rejected'}
              onClick={() => onMutate(node.localId, { reject: true })}
            >
              <X size={16} />
            </Button>
          </div>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          {node.kind === 'submission' ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <Label htmlFor={`workflow-${node.localId}`}>
                  Submission state
                </Label>
                <select
                  id={`workflow-${node.localId}`}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={workflowStatus}
                  onChange={(event) => setWorkflowStatus(event.target.value)}
                >
                  <option value="draft">draft</option>
                  <option value="submitted">submitted</option>
                  <option value="graded">graded</option>
                </select>
              </div>
              {workflowStatus === 'graded' ? (
                <>
                  <div>
                    <Label htmlFor={`percentage-${node.localId}`}>
                      Percentage
                    </Label>
                    <Input
                      id={`percentage-${node.localId}`}
                      type="number"
                      min="0"
                      max="100"
                      value={numericPercentage}
                      onChange={(event) =>
                        setNumericPercentage(event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor={`letter-${node.localId}`}>
                      Letter grade
                    </Label>
                    <Input
                      id={`letter-${node.localId}`}
                      value={letterGrade}
                      onChange={(event) => setLetterGrade(event.target.value)}
                    />
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div>
              <Label htmlFor={`primary-${node.localId}`}>
                {node.kind === 'student' ? 'Name' : 'Title'}
              </Label>
              <Input
                id={`primary-${node.localId}`}
                value={primary}
                onChange={(event) => setPrimary(event.target.value)}
              />
            </div>
          )}
          <Button
            type="button"
            size="sm"
            className="self-end"
            onClick={saveEdit}
          >
            Save edit
          </Button>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function SubmissionContent({
  node,
  organizationId,
  conversationId,
  onNodes,
  onEditInstructions,
}: {
  node: SeedNode;
  organizationId: string;
  conversationId: string;
  onNodes: (nodes: SeedNode[]) => void;
  onEditInstructions: () => void;
}) {
  const fetcher = useFetcher<SeedActionData>();
  const requested = React.useRef(false);
  const processed = React.useRef<SeedActionData | null>(null);
  const essayText =
    typeof node.data.essayText === 'string' ? node.data.essayText : '';

  const requestFill = React.useCallback(() => {
    requested.current = true;
    fetcher.submit(
      {
        intent: 'fill-node',
        organizationId,
        conversationId,
        localId: node.localId,
      },
      { method: 'post', action: ACTION }
    );
  }, [conversationId, fetcher, node.localId, organizationId]);

  React.useEffect(() => {
    if (
      fetcher.state === 'idle' &&
      fetcher.data &&
      fetcher.data !== processed.current
    ) {
      processed.current = fetcher.data;
      if (fetcher.data.nodes) onNodes(fetcher.data.nodes);
      if (fetcher.data.error) requested.current = false;
    }
  }, [fetcher.data, fetcher.state, onNodes]);

  return (
    <details
      className="mt-3 rounded-md border bg-muted/20 px-3 py-2"
      onToggle={(event) => {
        if (
          event.currentTarget.open &&
          !essayText &&
          !requested.current &&
          node.status !== 'rejected'
        ) {
          requestFill();
        }
      }}
    >
      <summary className="cursor-pointer text-sm font-medium">
        Essay content
      </summary>
      <div className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
        {essayText ? essayText : null}
        {fetcher.state !== 'idle' ? (
          <span
            className="flex items-center gap-2 text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="animate-spin" size={15} />
            Writing this submission…
          </span>
        ) : null}
        {fetcher.data?.error ? (
          <span className="block text-destructive" role="alert">
            {fetcher.data.error.message}
            {fetcher.data.error.type === 'transient' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 block"
                onClick={requestFill}
              >
                Retry content
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 block"
                onClick={onEditInstructions}
              >
                Edit instructions
              </Button>
            )}
          </span>
        ) : null}
      </div>
    </details>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
