/**
 * The picture of a map slide's map (Nov 19): the countries, water and route
 * in a view, as an SVG image, drawn from Yawp!'s own bundled map data. The
 * address carries everything the picture is drawn from (`mapImageSrc`), so
 * the same address is always the same picture and can be kept for good.
 * For anyone who can use the Lesson Planner; it holds nothing of theirs.
 */
import type { LoaderFunctionArgs } from 'react-router';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import { mapSvg } from '~/domain/geo/map-drawing.server';
import { readMapSpec } from '~/domain/geo/map-view';

/** The last pictures drawn, by address: a deck's thumbnails ask for the same map many times. */
const drawn = new Map<string, string>();
const KEEP = 60;

export async function loader({ request }: LoaderFunctionArgs) {
  await requireLessonPlannerAccess(request);
  const url = new URL(request.url);
  const spec = readMapSpec(url.searchParams);
  if (!spec) throw new Response('Not a map', { status: 400 });

  const key = url.searchParams.toString();
  let svg = drawn.get(key);
  if (!svg) {
    svg = mapSvg(spec);
    drawn.set(key, svg);
    if (drawn.size > KEEP) drawn.delete(drawn.keys().next().value!);
  }
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
