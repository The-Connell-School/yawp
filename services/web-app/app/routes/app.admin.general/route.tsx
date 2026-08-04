import {
  data as dataResponse,
  type LoaderFunctionArgs,
  useLoaderData,
} from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { requireAdmin } from '~/utils/auth.server';
import { CLASS_ART_LIBRARY, formatClassArtCredit } from '~/utils/class-art';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  return dataResponse({
    artworks: CLASS_ART_LIBRARY.map((entry) => ({
      src: entry.src,
      label: formatClassArtCredit(entry.credit),
    })),
  });
}

export default function AdminGeneralRoute() {
  const { artworks } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-8 p-3 md:p-5">
      <section data-testid="admin-class-artwork-section">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Class artwork</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              My Classes header library ({artworks.length} pieces). New classes
              rotate through these with different crops.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <div className="flex w-max items-stretch gap-3 pb-1">
            {artworks.map((artwork) => (
              <figure
                key={artwork.src}
                className="flex w-52 shrink-0 flex-col overflow-hidden rounded-lg bg-popover shadow-sm ring-1 ring-black/5"
              >
                <img
                  src={artwork.src}
                  alt={artwork.label}
                  className="h-32 w-full shrink-0 object-cover"
                  loading="lazy"
                />
                <figcaption className="flex flex-1 items-start text-balance px-3 py-2.5 text-sm leading-snug text-foreground">
                  {artwork.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
