import { useEffect } from 'react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { useLoaderData } from 'react-router';
import { ExternalLinkIcon, ImageIcon, PrinterIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import {
  getPromptById,
  getSourcesForPrompt,
  PREVIEW_ID,
  type SourceCard,
  type LibraryPrompt,
} from '../app.assignment-types.$id/library-data';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await requireProfile(request, userId);

  if (params.id !== PREVIEW_ID) {
    return redirect('/app');
  }

  const url = new URL(request.url);
  const promptId = url.searchParams.get('promptId');
  if (!promptId) {
    return redirect(`/app/assignment-types/${PREVIEW_ID}`);
  }

  const prompt = getPromptById(promptId);
  if (!prompt) {
    return redirect(`/app/assignment-types/${PREVIEW_ID}`);
  }

  const sources = getSourcesForPrompt(promptId);
  return dataResponse({ prompt, sources });
}

function SourceItem({ src, idx }: { src: SourceCard; idx: number }) {
  const isImageSource =
    src.mediaType === 'image' || src.mediaType === 'mixed';

  return (
    <li className="source-card border-l-2 border-stone-300 pl-4">
      <div className="mb-1 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Source {idx + 1}
        </p>
        {isImageSource && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 print:bg-amber-50">
            <ImageIcon className="h-3 w-3" />
            Visual source
          </span>
        )}
      </div>
      <h3 className="text-base font-semibold leading-snug">{src.title}</h3>
      <p className="mb-2 text-sm italic text-stone-600">{src.attribution}</p>

      {isImageSource && src.imageUrl && (
        <figure className="mb-3">
          <img
            src={src.imageUrl}
            alt={src.imageAlt ?? src.title}
            className="max-h-[500px] w-full rounded border border-stone-200 object-contain print:max-h-[400px]"
          />
          {src.imageAlt && (
            <figcaption className="mt-1.5 text-xs italic text-stone-500">
              {src.imageAlt}
            </figcaption>
          )}
        </figure>
      )}

      <p className="whitespace-pre-line text-sm leading-relaxed">{src.body}</p>

      {src.sourceUrl && (
        <p className="mt-1">
          <a
            href={src.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 break-all text-[11px] text-stone-500 underline-offset-2 hover:underline print:text-stone-400"
          >
            Source: {src.sourceUrl}
            <ExternalLinkIcon className="h-2.5 w-2.5 shrink-0 print:hidden" />
          </a>
        </p>
      )}
    </li>
  );
}

export default function SourcesPrintRoute() {
  const { prompt, sources } = useLoaderData<typeof loader>() as {
    prompt: LibraryPrompt;
    sources: SourceCard[];
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.print();
    }, 600);
    return () => window.clearTimeout(timer);
  }, []);

  const hasVisualSources = sources.some(
    (s) => s.mediaType === 'image' || s.mediaType === 'mixed'
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white text-black print:static print:overflow-visible">
      <style>{`
        @page { margin: 0.6in; }
        @media print {
          .print-hide { display: none !important; }
          .source-card { break-inside: avoid; page-break-inside: avoid; }
          img { max-width: 100%; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl px-8 py-6 print:px-0 print:py-0">
        <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div>
            <p className="text-xs text-stone-500">
              Print dialog opening… Set <strong>Destination</strong> to{' '}
              <strong>"Save as PDF"</strong> and click Save.
            </p>
            {hasVisualSources && (
              <p className="mt-1 text-xs text-amber-700">
                This source set includes visual sources (images). Make sure
                "Background graphics" is enabled in print settings for images to
                appear in the PDF.
              </p>
            )}
          </div>
          <Button size="sm" onClick={() => window.print()}>
            <PrinterIcon className="mr-1 h-4 w-4" /> Open print dialog
          </Button>
        </div>

        <header className="mb-6">
          <p className="text-xs uppercase tracking-wide text-stone-500">
            {prompt.type} · {prompt.period} · {prompt.era} · {prompt.id}
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-snug">
            AP History Essay — Source Set
          </h1>
        </header>

        <section className="mb-8 rounded border border-stone-300 bg-stone-50 p-4 print:border-stone-400 print:bg-white">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Prompt
          </p>
          <p className="text-base leading-relaxed">{prompt.prompt}</p>
        </section>

        <h2 className="mb-3 text-lg font-semibold">
          Sources ({sources.length})
        </h2>

        {sources.length === 0 ? (
          <p className="text-sm italic text-stone-500">
            Source set seeding pending for this prompt.
          </p>
        ) : (
          <ol className="list-none space-y-6 p-0">
            {sources.map((src, idx) => (
              <SourceItem key={src.id} src={src} idx={idx} />
            ))}
          </ol>
        )}

        <footer className="mt-10 border-t pt-3 text-xs text-stone-500 print:mt-6">
          Yawp · AP History Essay library · {prompt.id} · Source-set printout
        </footer>
      </div>
    </div>
  );
}
