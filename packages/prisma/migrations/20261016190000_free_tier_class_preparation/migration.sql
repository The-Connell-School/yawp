-- Nullable settings preserve existing applications and approval state.
ALTER TABLE "FreeTierApplication"
  ADD COLUMN "starterClassName" VARCHAR(100),
  ADD COLUMN "starterClassGrade" VARCHAR(5);
ALTER TABLE "FreeTierApplication" ADD CONSTRAINT "FreeTierApplication_starterClassGrade_check"
  CHECK ("starterClassGrade" IS NULL OR "starterClassGrade" IN ('9', '10', '11', '12', 'mixed'));
