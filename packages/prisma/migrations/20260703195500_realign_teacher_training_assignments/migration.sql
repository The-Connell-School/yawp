DO $$
DECLARE
  a_reference regclass;
  b_reference regclass;
BEGIN
  SELECT constraint_info.confrelid
    INTO a_reference
  FROM pg_constraint AS constraint_info
  WHERE constraint_info.conname = '_TeacherTrainingAssignments_A_fkey'
    AND constraint_info.conrelid = 'public."_TeacherTrainingAssignments"'::regclass;

  SELECT constraint_info.confrelid
    INTO b_reference
  FROM pg_constraint AS constraint_info
  WHERE constraint_info.conname = '_TeacherTrainingAssignments_B_fkey'
    AND constraint_info.conrelid = 'public."_TeacherTrainingAssignments"'::regclass;

  IF a_reference = 'public."TeacherTraining"'::regclass
    AND b_reference = 'public."OrgMembership"'::regclass THEN
    ALTER TABLE "_TeacherTrainingAssignments"
      DROP CONSTRAINT "_TeacherTrainingAssignments_A_fkey";
    ALTER TABLE "_TeacherTrainingAssignments"
      DROP CONSTRAINT "_TeacherTrainingAssignments_B_fkey";
    ALTER TABLE "_TeacherTrainingAssignments"
      DROP CONSTRAINT "_TeacherTrainingAssignments_AB_pkey";

    UPDATE "_TeacherTrainingAssignments"
    SET "A" = "B",
        "B" = "A";

    ALTER TABLE "_TeacherTrainingAssignments"
      ADD CONSTRAINT "_TeacherTrainingAssignments_AB_pkey"
      PRIMARY KEY ("A", "B");
    ALTER TABLE "_TeacherTrainingAssignments"
      ADD CONSTRAINT "_TeacherTrainingAssignments_A_fkey"
      FOREIGN KEY ("A") REFERENCES "OrgMembership"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "_TeacherTrainingAssignments"
      ADD CONSTRAINT "_TeacherTrainingAssignments_B_fkey"
      FOREIGN KEY ("B") REFERENCES "TeacherTraining"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
