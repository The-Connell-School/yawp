// Print-friendly view of a DBQ's source set. Opens in a new tab from the
// Create Assignment sheet's Download PDF button; the teacher uses the
// browser's Print → Save as PDF to capture it. Designed to render cleanly
// on white paper: no app chrome (overlaid on top of the app via fixed inset),
// per-source page-break hints, and a print-only stylesheet that strips the
// preview controls.

import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { useLoaderData } from 'react-router';
import { PrinterIcon } from 'lucide-react';
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

export default function SourcesPrintRoute() {
  const { prompt, sources } = useLoaderData<typeof loader>() as {
    prompt: LibraryPrompt;
    sources: SourceCard[];
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white text-black print:static print:overflow-visible">
      <style>{`
        @page { margin: 0.6in; }
        @media print {
          .print-hide { display: none !important; }
          .source-card { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="mx-auto max-w-3xl px-8 py-6 print:px-0 print:py-0">
        {/* Toolbar — hidden in print */}
        <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <p className="text-xs text-stone-500">
            Print preview · use <kbd className="rounded border px-1 text-[10px]">Cmd</kbd>+<kbd className="rounded border px-1 text-[10px]">P</kbd> (or your browser's Print menu) → "Save as PDF" to capture this source set.
          </p>
          <Button size="sm" onClick={() => window.print()}>
            <PrinterIcon className="mr-1 h-4 w-4" /> Print / Save as PDF
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
              <li key={src.id} className="source-card border-l-2 border-stone-300 pl-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Source {idx + 1}
                </p>
                <h3 className="text-base font-semibold leading-snug">
                  {src.title}
                </h3>
                <p className="mb-2 text-sm italic text-stone-600">
                  {src.attribution}
                </p>
                <p className="whitespace-pre-line text-sm leading-relaxed">
                  {src.body}
                </p>
                {src.sourceUrl ? (
                  <p className="mt-1 break-all text-[11px] text-stone-500">
                    Source: {src.sourceUrl}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        <footer className="mt-10 border-t pt-3 text-xs text-stone-500 print:mt-6">
          Yawp · AP History Essay library · {prompt.id} · Preview source-set
          printout. Real corpus seeding happens during engineering handoff.
        </footer>
      </div>
    </div>
  );
}
