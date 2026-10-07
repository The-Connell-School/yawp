-- Roll back the migration record in Prisma after reverting the app deploy:
--   bun prisma migrate resolve --rolled-back 20261007174800_bootstrap_exit_ticket_assignment_type
-- To remove the Exit Ticket type created by the seed script, run the seed's
-- inverse manually only if no assignments reference kind exit_ticket.

SELECT 1;
