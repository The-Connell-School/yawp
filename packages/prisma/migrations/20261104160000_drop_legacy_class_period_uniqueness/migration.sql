-- Hotfix: production databases that missed earlier migrations could still enforce
-- Class (schoolId, period, grade) or (schoolId, schoolYear, period, grade)
-- uniqueness. That blocks teachers from recreating the same section in a new
-- school year. Code uniqueness remains on (schoolId, code).
DROP INDEX IF EXISTS "Class_schoolId_period_grade_key";
DROP INDEX IF EXISTS "Class_schoolId_schoolYear_period_grade_key";
