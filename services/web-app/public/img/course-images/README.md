# Course images

Committed course tile images, loaded into `AssignmentTypeImage` by the seed so
they persist across preview/local reseeds (the admin-uploaded blob is wiped on
every reseed, a committed file is not).

## AP English Literature

Drop an image named `ap-english-literature.{jpg,jpeg,png,webp}` in this folder
and commit it. The synthetic seed (`packages/prisma/scripts/local-dev/seed-synthetic-data.ts`)
reads the first matching file and stores it as the AP Lit course image on every
reseed. No image file is required — if none is present the course simply has no
tile image.
