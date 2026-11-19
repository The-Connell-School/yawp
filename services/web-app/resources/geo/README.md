# Map data

What the Lesson Planner's map slides are drawn from (Nov 19, 2026). Nothing
here is fetched when a map is drawn: the app reads these files and nowhere
else. They are written by `services/web-app/scripts/geo/build-geo-data.mjs`;
see the top of that file for how to run it.

| File | Holds | From | Licence |
| --- | --- | --- | --- |
| `countries-50m.json`, `countries-110m.json` | Country shapes with their names, as TopoJSON | [Natural Earth](https://www.naturalearthdata.com/) 1:50m and 1:110m, via the `world-atlas` package | Public domain |
| `water-50m.json` | Rivers and lakes | Natural Earth 1:50m, via the `sane-topojson` package | Public domain |
| `countries.json` | What each country is called (so "South Sudan" finds the shape named "S. Sudan") | ISO 3166-1 names via the `i18n-iso-countries` package, and a short list of our own | MIT |
| `places.json` | Towns of 5,000 people or more and every capital: name, country, state or province, population, position | [GeoNames](https://www.geonames.org/), via the `all-the-cities` package | CC BY 4.0 |

GeoNames asks for credit. Every map slide carries it: "Map: Natural Earth.
Places: GeoNames."

The shapes are today's borders. A map slide says so.
