ALTER TABLE "Class" ADD COLUMN "cardGradientKey" TEXT;

UPDATE "Class"
SET "cardGradientKey" = (ARRAY[
  'indigo-purple-pink',
  'cyan-blue-indigo',
  'amber-orange-rose',
  'emerald-teal-cyan',
  'violet-fuchsia-amber',
  'rose-red-orange'
])[1 + (abs(hashtext("id")) % 6)]
WHERE "cardGradientKey" IS NULL;

ALTER TABLE "Class" ALTER COLUMN "cardGradientKey" SET NOT NULL;
ALTER TABLE "Class" ALTER COLUMN "cardGradientKey" SET DEFAULT 'indigo-purple-pink';
