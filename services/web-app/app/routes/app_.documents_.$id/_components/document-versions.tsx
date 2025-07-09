import { type DocumentVersion } from '@app/prisma';
import { Link, useFetcher, useSearchParams } from 'react-router';
import { HistoryIcon, Repeat2Icon } from 'lucide-react';
import { Button, button } from '~/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from '~/components/ui/dialog.js';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Tooltip } from '~/components/ui/tooltip.js';
import { cn, useIsPending } from '~/utils/misc';

type Props = { documentId: string; versions: DocumentVersion[] };

export const DocumentVersions = ({ documentId, versions }: Props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const versionId = searchParams.get('versionId');
  const version = versions.find((v) => v.id === versionId);
  const fetcher = useFetcher({ key: 'restore-document-version' });
  const isPending = useIsPending({
    formAction: '/api/domain/restore-document-version',
  });

  const closeSheet = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('versionId');
    setSearchParams(params);
    localStorage.setItem(`document-${documentId}`, version?.html ?? '');
    const editor = document.querySelector('div.tiptap');
    if (editor) {
      editor.innerHTML = version?.html ?? '';
    }
  };

  const selectVersion = (versionId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('openVersion', versionId);
    setSearchParams(params);
  };

  return (
    <Sheet open={!!versionId} onOpenChange={closeSheet}>
      <SheetTrigger asChild>
        <Link
          className={cn(button({ variant: 'ghost', size: 'icon-sm' }), {
            'pointer-events-none opacity-40 hover:bg-transparent':
              !versions.length,
          })}
          to={`/app/documents/${documentId}?versionId=${versions[0]?.id}`}
        >
          <HistoryIcon size={18} strokeWidth={1.5} />
        </Link>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col overflow-hidden rounded-l-none transition sm:max-w-full md:max-w-[900px] md:rounded-l-lg">
        <SheetHeader className="p-1">
          <SheetTitle>Version History</SheetTitle>
        </SheetHeader>
        <div className="flex grow flex-col overflow-hidden sm:flex-row">
          <div className="no-scrollbar mb-2 grid max-h-[300px] min-h-[200px] grid-cols-2 gap-1 overflow-scroll p-1 sm:mb-0 sm:flex sm:max-h-full sm:w-1/2 sm:flex-col">
            {versions.map((v) => (
              <div key={v.id} className="flex">
                <Link
                  onClick={() => selectVersion(v.id)}
                  className={cn(
                    'h-fit grow rounded px-3 py-2 text-sm text-muted-foreground hover:bg-muted/70 sm:text-base',
                    {
                      'bg-muted text-foreground hover:bg-muted':
                        v.id === versionId,
                    }
                  )}
                  to={`/app/documents/${documentId}?versionId=${v.id}`}
                >
                  {new Date(v.createdAt).toLocaleString()}
                </Link>
                {/* <Dialog>
									<Tooltip text="Restore this version">
										<DialogTrigger asChild>
											<Button
												size="icon"
												variant="outline"
												className={cn('hidden h-9 sm:h-auto', {
													'ml-1 flex': v.id === versionId,
												})}
											>
												<Repeat2Icon
													strokeWidth={1.5}
													size={20}
													className="mr-1"
												/>
											</Button>
										</DialogTrigger>
									</Tooltip>
									<DialogContent>
										<DialogHeader>
											<h3>Restore Version?</h3>
										</DialogHeader>
										<DialogDescription>
											Are you sure you want to restore this version? This will
											replace your existing content. It will also create a new
											version to reference later.
										</DialogDescription>
										<DialogFooter>
											<fetcher.Form
												method="POST"
												action="/api/domain/restore-document-version"
											>
												<input type="hidden" name="versionId" value={v.id} />
												<Button
													disabled={isPending}
													onClick={() => (isPending ? undefined : closeSheet())}
												>
													{isPending ? "Restoring..." : "Restore"}
												</Button>
											</fetcher.Form>
											<DialogClose>
												<Button variant="secondary">Cancel</Button>
											</DialogClose>
										</DialogFooter>
									</DialogContent>
								</Dialog> */}
              </div>
            ))}
          </div>
          <div className="no-scrollbar flex w-full grow flex-col gap-2 overflow-scroll rounded-lg bg-muted p-1">
            {version ? (
              <div
                dangerouslySetInnerHTML={{ __html: version.html }}
                className="p-3 font-times"
              />
            ) : null}
          </div>
        </div>
        <SheetFooter>
          <Button onClick={closeSheet}>Close</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
