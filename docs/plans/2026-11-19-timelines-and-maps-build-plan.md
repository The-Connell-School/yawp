# Timelines and maps for introducing a text

Build plan, Nov 19, 2026. Source: Kevin, Nov 19: "teaching books includes
backgrounds and timelines … interactive and illustrative ones for the
teachers to use as tools when introducing the text."

Built on the deck studio branch (`docs/plans/2026-11-19-deck-studio-build-plan.md`),
so a timeline or a map is edited on the slide and by chat like any other
slide. Paths are relative to `services/web-app/app/` unless they start with a
top-level folder.

## Status, Nov 19

Phases 1 and 2 are built on `claude/context-tools-timeline-map` (it
carries the deck studio branch; since Nov 20 its PR targets `main`, so it
gets its own preview), behind `lesson_planner_context_tools`, off by
default. Phase 3 is not started. Screenshots: `artifacts/timelines-and-maps/`.

Checked:

- Unit tests: the schema, the stepped-slide helpers, the timeline and map in
  the kit's layout, the map data against real geography (Khartoum is inside
  Sudan's shape, a river runs past it), the place finder (two towns of one
  name, former names, a place that is not there), the map picture, both new
  routes, the planner's prompt, and a PDF and a PowerPoint made from a deck
  holding both slides.
- Existing slide layouts, compared before and after: unchanged.
- Browser tests (Chromium), 36 passing: the new
  `teacher.lesson-planner-context-tools.spec.ts` (Present steps through a
  timeline and a map; the map's picture loads and nothing outside Yawp! is
  asked for it; the studio types on an event, adds one, renames a place and
  its pin moves; the older look shows lists), with the deck studio, kit v4,
  kit v4.1 and editor suites.
- Typecheck.

Not checked:

- **The planner writing these slides.** No model was called: the prompt
  section is tested for what it says, not for what a model does with it.
  It needs a pass on a preview with the flag on, like the bot test of
  Nov 19.
- **The PowerPoint file opened in PowerPoint, Google Slides or Keynote.**
  The file holds the map as an SVG picture; whether each app draws it was
  not looked at.
- The PDF by eye (it is tested to draw the map's paths, not for how it looks).
- Firefox, and a phone-width screen.

Known limits of what is built:

- A map has no state or province lines, so a map inside one country (the
  Salinas valley) is a coast, rivers and pins.
- Towns close together have their names pushed apart; each pin carries its
  number to say which is which.
- A shared lesson's page does not show the map's picture, which is served
  to signed-in planner users only (as teachers' own pictures are).
- On the slide a teacher can change an event's or a place's words. Whether
  a route is drawn, what is shaded and a place's `where` change by asking
  Yawp! in the studio's chat, or by typing "Salinas, California" as the
  name.
- PowerPoint and the PDF carry the overview of a stepped slide, not one
  slide per step (phase 3).

Found in a demo pass, Nov 20 (decks for Night, Romeo and Juliet, Things
Fall Apart, Persepolis and Heart of Darkness, presented locally; the
planner was not called):

- A timeline with six or seven events in two rows breaks a long word
  mid-word ("Auschwit / z", "Buchenwal / d"): each event's column is the
  gap between marks, and nothing stops the break inside a word.
- An event added on the slide in the studio goes to the top row; there is
  no way to say which row it belongs in.
- Places close together collide at a wide view: a pin can sit on another
  place's name (Venice on Verona), or under another pin (Matadi under
  Kinshasa).
- Older names are not found: Auschwitz, Gleiwitz, Buchenwald, Ypres,
  Mantua. The modern names are (Oświęcim, Gliwice, Weimar, Ieper,
  Mantova), with the older one as the place's label.
- A thin horizontal line crosses some wide maps of Africa (seen on Africa
  1914 and the Heart of Darkness map).

## 1. What we are building

Two new kinds of slide the planner can write when a lesson introduces a text:

- **Timeline.** Four to eight events on a line, each with a date, a short
  title and one sentence. Optionally two rows, for what happened in the
  world above the line and the book or its author below it.
- **Map.** A region drawn from real map data, with two to eight places, each
  with a note. Optionally a route joining them in order (a journey), and
  countries shaded with a label ("Anglo-Egyptian Sudan, 1899 to 1956").

Both are **stepped** in Present: the right arrow (or a click) moves through
the events or places one at a time, the one in focus is drawn in full and
its sentence is shown, and the next arrow after the last one moves to the
next slide. A slide with nothing in focus is the overview.

Both are slides in the deck. So they are written by the planner, checked,
presented, downloaded, typed on in the deck studio and changed by "Ask
Yawp!" through the code that already does those things for every slide.

## 2. What exists today

- A "Context" step in lesson plans (5 minutes by default).
- One slide type (`notes`) that lists 3 to 5 `{ year, caption }` entries,
  captions of six words. Static.
- No maps, no map data, no map code. A map appears only if the teacher
  uploads a picture of one.
- One layout for every renderer (`layoutKitV4Slide`): boxes of text,
  rectangles and pictures. Present, PowerPoint and both PDFs draw it.

## 3. Decisions

1. **Slides, not a separate tool.** A timeline or map is a slide layout
   (`timeline`, `map`), so everything that reads a deck keeps working and
   the studio and the chat edit them for free.
2. **Real map data, bundled.** Country shapes, rivers and lakes from Natural
   Earth (public domain) and a place list from GeoNames (CC BY 4.0), kept in
   `services/web-app/resources/geo/`. No outside map service: nothing about
   a teacher or a class leaves Yawp!, previews and tests work offline, and
   there is no per-use cost.
3. **Yawp! places the pins, never the model.** The model names a place
   ("Khartoum", in "Sudan"). The server looks it up and writes its
   coordinates and what it matched onto the slide. Coordinates the model
   writes are thrown away. A place that is not found is not drawn, and the
   studio says so.
4. **Dates cannot be checked by code.** The studio says, on a timeline, that
   Yawp! wrote the dates from memory and to check them. The planner is told
   to leave out any date or place it is not sure of.
5. **Modern borders only, said plainly.** The data has today's countries.
   "Sudan in 1956" is drawn by shading Sudan and South Sudan together under
   the teacher's label. True historical borders need another dataset (see
   Not in this plan).
6. **One flag**, off by default: `lesson_planner_context_tools` (needs
   Lesson Deck Kit v4). With it off the planner is not told the two layouts
   exist, so no deck has them. Drawing them needs no flag: a deck that has
   one is drawn wherever it is opened.
7. **Older looks get a list.** The spec v3, tile and plain renderers draw a
   timeline as dated lines and a map as its places with their notes. Only
   the kit's v4 layout draws the line and the map.

## 4. The data on a slide

Added to the slide schema (`domain/lesson-planner/slide-deck.ts`), all
optional, so every stored deck still validates:

```ts
// layout: 'timeline'
events: [{ date: string(24), title: string(60), detail?: string(220), track?: 1 | 2 }]  // 2 to 8
tracks: [string(30), string(30)]        // the two rows' names, when there are two

// layout: 'map'
places: [{
  name: string(60),                     // looked up: the place's own, modern name
  where?: string(60),                   // country or state, to tell two Springfields apart
  label?: string(40),                   // what the slide calls it ("Constantinople")
  note?: string(200),
  lat?, lon?, found?: string(120),      // written by Yawp! only
}]                                      // 1 to 8
route?: boolean                         // join the places in order
shade?: string(60)[]                    // up to 4 modern countries
shadeLabel?: string(60)
view?: { w, s, e, n }                   // the area drawn; written by Yawp! only
```

Never stored: `focus`, the event or place in focus. It is set where a slide
is drawn (Present, an export), like the deck's `kit`.

## 5. Phase 1: stepped slides and the timeline

| File | Change |
| --- | --- |
| `domain/lesson-planner/slide-deck.ts` | The two layouts and their fields; the checks (a timeline needs 2 events, a map needs a place); `classicSlide` draws each as a list; `Slide` gains render-only `focus` |
| `domain/lesson-planner/context-slides.ts` (new) | Pure: `slideSteps(slide)` (how many steps), `legacyContextSlide(slide)` (a timeline or map as a `notes` slide for spec v3), `withSlideFocus(deck, index, focus)` |
| `domain/lesson-planner/deck-kit-v4.ts` | Templates `timeline` and `map`; the timeline's line, marks, dates, titles and the sentence in focus; sources on every word, so the studio types on them |
| `domain/lesson-planner/deck-gallery.ts` | Spec v3 draws the list form |
| `routes/present.$conversationId.$messageId/route.tsx` | The focus state: arrows step through a slide's events before leaving it; a click on an event focuses it; Home and End unchanged |
| `routes/present.$conversationId.$messageId/kit-v4-slide-canvas.tsx` | An optional `onStep`: an event's box is a button in Present |
| `domain/lesson-planner/deck-on-slide.ts` | `events` and `places` as lists (Enter adds, Backspace removes) with their limits |
| `domain/lesson-planner/deck-command.ts` | The two layouts in the fields the chat is told about |
| `routes/api.domain.lesson-planner/build-system-prompt.ts` | A "Background for a text" section, sent with the flag on |
| flag files | `lesson_planner_context_tools` |

Timeline layout, 1280 by 720: the headline top left; a solid bar in the deck
color across the slide; each event a square mark on the bar with its date
(Georgia, deck color) and title (Arial bold) beside it. One row: events
alternate above and below the bar, so each has twice the room. Two rows:
row 1 above, row 2 below, each row's name at the left end. In focus: that
event in ink and the deck color, the rest grey, and its sentence set large
under the headline. Only rectangles and text, so PowerPoint and the PDFs
draw it with no change to them.

Tests first: `context-slides.test.ts`, the schema's own tests, the layout
(every event drawn, the focused one's sentence shown, sources read back to
their fields), `deck-on-slide.test.ts` for the two lists, and
`teacher.lesson-planner-context-tools.spec.ts` in a browser: Present steps
through a timeline and then leaves it; the studio types on an event; the
older look shows the list.

## 6. Phase 2: the map

### 6.1 Data, once

`scripts/geo/build-geo-data.ts` (run by hand, from packages installed
outside the app) writes three files to `services/web-app/resources/geo/`,
with a README naming each source and its licence:

| File | From | Holds |
| --- | --- | --- |
| `countries-50m.json`, `countries-110m.json` | Natural Earth via `world-atlas` | Country shapes and names, as TopoJSON |
| `water-50m.json` | Natural Earth via `sane-topojson` | Rivers and lakes |
| `places.json` | GeoNames via `all-the-cities` | Cities of 5,000 people or more, capitals whatever their size: name, country, state, population, position |

No new packages in the app: TopoJSON is decoded by 40 lines of our own
(`domain/geo/topojson.ts`), tested against known points.

### 6.2 Finding a place

`domain/geo/places.server.ts`: `findPlace(name, where?)`.

- Exact name first (accents and case ignored), then a short list of former
  names every teacher will use (Constantinople, Bombay, Leningrad, Peking,
  Saigon and a dozen more).
- `where` narrows by country name or US state. Among several matches the
  largest wins.
- A country's own name finds the country (its position is its centre).
- The answer says what it matched ("Soledad, California, United States"),
  which the studio shows, so a wrong match is visible.

`resolveDeckPlaces(deck)` runs wherever a deck is about to be stored or
handed back: the planner's reply, the editor's save, the chat's answer.

### 6.3 Drawing it

- `domain/geo/map-view.ts` (pure, used by server and browser): the view that
  frames the places and the shaded countries at the map box's shape, and
  `mapPoint(view, lon, lat)` in a Mercator projection.
- `domain/geo/map-drawing.server.ts`: the countries, water and route inside
  a view as path data, once, for every renderer.
- `routes/api.lesson-planner-map[.]svg/route.ts`: that drawing as an SVG
  image, for signed-in planner users, cached. Present and the studio show
  it with an `<img>`.
- The kit layout puts the map image in a box on the left and lays the pins
  (squares, with their labels) over it from each place's position, and the
  stops with their notes down the right. A new layout element, `map`, which
  all three renderers learn.
- PDF: the same paths drawn by pdfkit. PowerPoint: the SVG as a picture.

### 6.4 Tests

`topojson.test.ts`, `places.server.test.ts` (the places the bot lessons
used; two towns of one name; a former name; nothing found), `map-view.test.ts`
(a pin inside its country's box), `map-drawing.server.test.ts`, the route's
test, the layout's test, and the browser spec: a map slide shows its
picture and pins, steps through its places, and an edited place name moves
its pin.

## 7. Phase 3, after these two

- One static slide per step in PowerPoint and the PDF (an overview, then
  each event or place in focus).
- A handout: the timeline or map on a page with room to annotate.
- Zoom: from the whole route to one stop.
- Pictures on events, once there is a source for them.

## 8. Risks

| Risk | What we do |
| --- | --- |
| A wrong date in front of a class | The planner is told to leave out what it is not sure of; the studio says to check; every date is one click to fix |
| A pin in the wrong town | Places come from the place list, the match is shown by name, and `where` is asked for whenever a name is common |
| A place the list does not have (a village, a fictional town) | Not drawn; the studio lists it; the teacher renames it to somewhere nearby or removes it |
| Today's borders shown for 1899 | The label is the teacher's; the studio's note on a map says the borders are today's |
| The map file is large | 110m shapes for wide views, 50m for regions; only the countries in view are sent |
| A new element in the layout breaks an export | The PDF and PowerPoint renderers each get the `map` case, with tests that render a deck holding one |
| SVG pictures in PowerPoint | Supported in PowerPoint 2019 and 365. Not checked in Google Slides or Keynote; listed under Not checked when built |

## 9. Not in this plan

- Historical borders (a dataset such as CShapes, and its licence).
- A map service with streets or terrain.
- Pictures found on the web.
- Fictional places drawn on a real map.
- Timelines or maps outside a deck (in a handout or the lesson plan itself).
