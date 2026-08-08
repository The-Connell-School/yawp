# Seed assets

Binary assets baked into system courses by the seed scripts.

## College Admissions Essay course image

To set the course header image, drop the image file here as one of:

- `college-essay-course.png` (preferred)
- `college-essay-course.jpg` / `.jpeg`
- `college-essay-course.webp`

`seed-college-essay-course.ts` (`upsertCourseImage`) reads the first match,
stores it as the course's `AssignmentTypeImage`, and no-ops if no file is
present — so the seed is always safe to run. Re-run the seed after adding or
changing the file:

```bash
bun run --cwd packages/prisma seed-college-essay-course
```

Keep the asset reasonably small (a header thumbnail, not a full-resolution
export) since it is stored as a row in the database.
