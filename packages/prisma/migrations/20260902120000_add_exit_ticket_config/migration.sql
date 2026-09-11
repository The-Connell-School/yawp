-- Exit tickets record what the teacher answered in the creation form.
-- Additive and nullable: every existing assignment keeps reading its prompt
-- from "prompt", which exit tickets also write, so nothing depends on this
-- column being populated.
SET lock_timeout = '5s';
SET statement_timeout = '2min';

ALTER TABLE "Assignment"
  ADD COLUMN "exitTicketConfigJson" JSONB;
