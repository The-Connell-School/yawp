-- Aggregate-only MIND snapshot. psql -X -qAt -v ON_ERROR_STOP=1 -f report.sql
-- Run with PGOPTIONS='-c default_transaction_read_only=on'. No customer text exported.
\if :{?lookback_months}
\else
\set lookback_months 12
\endif
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '3s';
SET LOCAL TIME ZONE 'UTC';
WITH
params AS (SELECT now() AS as_of, date_trunc('month', now()) - make_interval(months => :lookback_months::int) AS start_at,
  extract(year FROM now()-interval '6 months')::int::text||'-'||(extract(year FROM now()-interval '6 months')::int+1)::text AS school_year),
excluded_orgs(id) AS (VALUES ('prod-qa-org'), ('prod-qa-v3-org'),
  ('cmlydo5te000u0qjzv0hmjscc'), ('cmgtqun5v03apl309iozfnorc')),
-- These legacy School rows are demo/internal or person labels, not verified institutions.
excluded_schools(id) AS (VALUES ('a6dc62a42e401ff921ae73ab'),('d674b7487be6843abcee4024'),
  ('6aebc8309acfd9bb7d668eaf'),('b45af709c939d4225443d811'),('cmgtqbr6a03ahl309vlhb1523'),
  ('cmhc694n005r9jx0qpblebjzz'),('56bb14dda388a41cb7504796'),('4cc6c496645bbe94a1bef59b')),
orgs AS (SELECT o.* FROM "Organization" o WHERE NOT EXISTS (SELECT 1 FROM excluded_orgs x WHERE x.id=o.id)),
eligible_members AS MATERIALIZED (
  SELECT m.* FROM "OrgMembership" m JOIN "User" u ON u.id=m."userId" JOIN orgs o ON o.id=m."organizationId"
  WHERE NOT u."isAdmin" AND NOT u."isSuperAdmin"
    AND u.email !~* '(@(example[.]com|yawp[.]local|brock[.]software)$|(^|[+._-])(qa|test|demo)([+._@-]|$))'
),
real_schools AS (SELECT s.* FROM "School" s JOIN orgs o ON o.id=s."organizationId"
  WHERE NOT EXISTS (SELECT 1 FROM excluded_schools x WHERE x.id=s.id)),
schools AS (
  SELECT id,name,"organizationId",true real_school FROM real_schools
  UNION ALL SELECT 'unassigned:'||id,'Unassigned school',id,false FROM orgs
),
-- Use all school links before exclusions; a test-school link must not silently fall into a real school.
member_links AS MATERIALIZED (
  SELECT m.id membership_id,c."schoolId" school_id FROM eligible_members m
  JOIN "_ClassStudents" j ON j."B"=m.id JOIN "Class" c ON c.id=j."A"
  JOIN "School" s ON s.id=c."schoolId" AND s."organizationId"=m."organizationId" WHERE m.role='STUDENT'
  UNION SELECT m.id,c."schoolId" FROM eligible_members m
  JOIN "_ClassTeachers" j ON j."B"=m.id JOIN "Class" c ON c.id=j."A"
  JOIN "School" s ON s.id=c."schoolId" AND s."organizationId"=m."organizationId" WHERE m.role='TEACHER'
  UNION SELECT m.id,j."B" FROM eligible_members m JOIN "_SchoolTeachers" j ON j."A"=m.id
  JOIN "School" s ON s.id=j."B" AND s."organizationId"=m."organizationId" WHERE m.role='TEACHER'
),
one_org_school AS (SELECT "organizationId",min(id) id FROM "School" GROUP BY 1 HAVING count(*)=1),
member_schools AS MATERIALIZED (
  SELECT * FROM member_links
  UNION SELECT m.id,coalesce(os.id,'unassigned:'||m."organizationId") FROM eligible_members m
  LEFT JOIN one_org_school os ON os."organizationId"=m."organizationId"
  WHERE NOT EXISTS (SELECT 1 FROM member_links l WHERE l.membership_id=m.id)
),
one_member_school AS (SELECT membership_id,min(school_id) school_id FROM member_schools GROUP BY 1 HAVING count(*)=1),
mapped_docs AS MATERIALIZED (
  SELECT d.id,d."createdAt",d."membershipId",d."deletedAt",d."archivedAt",d."artifactKind",
    coalesce(c.id,fc.id) class_id,
    coalesce(c."schoolId",fc."schoolId",ms.school_id,'unassigned:'||m."organizationId") school_id,
    CASE WHEN c.id IS NOT NULL THEN 'class_assignment' WHEN fc.id IS NOT NULL THEN 'preserved_legacy_class'
      WHEN ms.school_id IS NOT NULL AND ms.school_id NOT LIKE 'unassigned:%' THEN 'current_membership_inferred'
      ELSE 'unassigned' END attribution
  FROM "Document" d LEFT JOIN "OrgMembership" m ON m.id=d."membershipId"
  LEFT JOIN "ClassAssignment" ca ON ca.id=d."classAssignmentId" LEFT JOIN "Class" c ON c.id=ca."classId"
  LEFT JOIN "DocumentClassForensic" f ON f."documentId"=d.id LEFT JOIN "Class" fc ON fc.id=f."oldClassId"
  LEFT JOIN one_member_school ms ON ms.membership_id=d."membershipId"
  WHERE (d."membershipId" IN (SELECT id FROM eligible_members WHERE role='STUDENT') OR d."artifactKind"::text='assignment-group')
),
docs AS MATERIALIZED (SELECT d.* FROM mapped_docs d JOIN schools s ON s.id=d.school_id),
submissions AS MATERIALIZED (
  SELECT s.id,s."submittedAt",s."gradedAt",s."releasedAt",s."gradedByMembershipId",s."unsubmittedAt",
    d.id document_id,d.school_id,d.class_id,d."membershipId",d.attribution,
    row_number() OVER (PARTITION BY d.id ORDER BY s."submittedAt",s.id) AS submission_number
  FROM "Submission" s JOIN docs d ON d.id=s."documentId" CROSS JOIN params p WHERE s."submittedAt" < p.as_of
),
teacher_events AS MATERIALIZED (
  SELECT s.school_id,s."gradedAt" at,s."gradedByMembershipId" membership_id,'direct_feedback' kind
  FROM submissions s JOIN eligible_members m ON m.id=s."gradedByMembershipId" AND m.role='TEACHER'
  JOIN schools sc ON sc.id=s.school_id AND sc."organizationId"=m."organizationId" WHERE s."gradedAt" IS NOT NULL
  UNION ALL SELECT d.school_id,c."createdAt",m.id,'direct_feedback'
  FROM "DocumentComment" c JOIN docs d ON d.id=c."documentId"
  JOIN eligible_members m ON m.id=c."membershipId" AND m.role='TEACHER'
  JOIN schools sc ON sc.id=d.school_id AND sc."organizationId"=m."organizationId"
  UNION ALL SELECT s.school_id,c."createdAt",c."membershipId",'direct_feedback'
  FROM "SubmissionComment" c JOIN submissions s ON s.id=c."submissionId"
  JOIN eligible_members m ON m.id=c."membershipId" AND m.role='TEACHER'
  JOIN schools sc ON sc.id=s.school_id AND sc."organizationId"=m."organizationId"
  UNION ALL SELECT s.school_id,a."createdAt",a."actorMembershipId",'direct_feedback'
  FROM "SubmissionActivity" a JOIN submissions s ON s.id=a."submissionId"
  JOIN eligible_members m ON m.id=a."actorMembershipId" AND m.role='TEACHER' AND a."organizationId"=m."organizationId"
  WHERE a."eventType" IN ('submission.grade_updated','submission.grade_finalized','submission.grade_released',
    'submission.comment_created','submission.comment_updated','submission.grading_assistant_updated')
  UNION ALL SELECT s.school_id,s."submittedAt",m.id,'classroom_submission'
  FROM submissions s JOIN "_ClassTeachers" ct ON ct."A"=s.class_id
  JOIN eligible_members m ON m.id=ct."B" AND m.role='TEACHER'
  JOIN schools sc ON sc.id=s.school_id AND sc."organizationId"=m."organizationId"
  UNION ALL SELECT c."schoolId",ca."createdAt",m.id,'classroom_assignment'
  FROM "ClassAssignment" ca JOIN "Class" c ON c.id=ca."classId" JOIN "_ClassTeachers" ct ON ct."A"=c.id
  JOIN eligible_members m ON m.id=ct."B" AND m.role='TEACHER'
  JOIN schools sc ON sc.id=c."schoolId" AND sc."organizationId"=m."organizationId"
),
first_activation AS (SELECT school_id,membership_id,min(at) FILTER(WHERE kind IN ('direct_feedback','classroom_submission')) activated_at,
  min(at) FILTER(WHERE kind='classroom_assignment') setup_at FROM teacher_events CROSS JOIN params p WHERE at<p.as_of GROUP BY 1,2),
events AS MATERIALIZED (
  SELECT s.school_id,s."submittedAt" at,'submission' kind,s.id event_id,s.document_id,
    s."membershipId" membership_id,NULL::text assignment_id,s.attribution,s.submission_number FROM submissions s
  UNION ALL SELECT s.school_id,s."gradedAt",'graded',s.id,s.document_id,NULL,NULL,s.attribution,NULL FROM submissions s WHERE s."gradedAt" IS NOT NULL
  UNION ALL SELECT s.school_id,s."releasedAt",'released',s.id,s.document_id,NULL,NULL,s.attribution,NULL FROM submissions s WHERE s."releasedAt" IS NOT NULL
  UNION ALL SELECT c."schoolId",ca."createdAt",'assignment',ca.id,NULL,NULL,ca."assignmentId",'class_assignment',NULL
    FROM "ClassAssignment" ca JOIN "Class" c ON c.id=ca."classId" JOIN schools sc ON sc.id=c."schoolId"
  UNION ALL SELECT d.school_id,j."createdAt",'student_save',j.id,d.id,j."membershipId",NULL,d.attribution,NULL
    FROM "DocumentWriteJournal" j JOIN docs d ON d.id=j."documentId" JOIN eligible_members m ON m.id=j."membershipId" AND m.role='STUDENT'
    JOIN schools sc ON sc.id=d.school_id AND sc."organizationId"=m."organizationId"
    WHERE j.status='accepted' AND j."eventType"='document.save'
  UNION ALL SELECT d.school_id,d."createdAt",'document_created',d.id,d.id,d."membershipId",NULL,d.attribution,NULL
    FROM docs d WHERE d."membershipId" IS NOT NULL
  UNION ALL SELECT d.school_id,msg."createdAt",'student_tutor_message',msg.id,d.id,m.id,NULL,d.attribution,NULL
    FROM "AssignmentModuleSessionMessage" msg JOIN "AssignmentModuleSession" sess ON sess.id=msg."assignmentModuleSessionId"
    JOIN docs d ON d.id=sess."documentId" JOIN eligible_members m ON m.id=coalesce(sess."membershipId",d."membershipId") AND m.role='STUDENT'
    JOIN schools sc ON sc.id=d.school_id AND sc."organizationId"=m."organizationId"
    WHERE msg.agent='user'
  UNION ALL SELECT d.school_id,cr."createdAt",'student_comment_reply',cr.id,d.id,m.id,NULL,d.attribution,NULL
    FROM "DocumentCommentResponse" cr JOIN "DocumentComment" c ON c.id=cr."commentId" JOIN docs d ON d.id=c."documentId"
    JOIN eligible_members m ON m.id=cr."membershipId" AND m.role='STUDENT'
    JOIN schools sc ON sc.id=d.school_id AND sc."organizationId"=m."organizationId"
),
periods AS (
  SELECT 'month' grain,t period,t+interval '1 month' period_end FROM params p,
    generate_series(p.start_at,date_trunc('month',p.as_of),interval '1 month') t
  UNION ALL SELECT 'week',t,t+interval '1 week' FROM params p,
    generate_series(date_trunc('week',p.start_at),date_trunc('week',p.as_of),interval '1 week') t
),
school_counts AS (
  SELECT s.id school_id,
    count(DISTINCT m.id) FILTER(WHERE m.role='TEACHER') registered_teachers,
    count(DISTINCT m.id) FILTER(WHERE m.role='TEACHER' AND m."isActive") enabled_teachers,
    count(DISTINCT m.id) FILTER(WHERE m.role='STUDENT') registered_students,
    count(DISTINCT m.id) FILTER(WHERE m.role='STUDENT' AND m."isActive") enabled_students,
    count(DISTINCT m.id) FILTER(WHERE m.role='TEACHER' AND fa.activated_at IS NOT NULL) activated_teachers,
    count(DISTINCT m.id) FILTER(WHERE m.role='TEACHER' AND fa.setup_at IS NOT NULL) setup_teachers,
    count(DISTINCT m.id) FILTER(WHERE m.role='TEACHER' AND fa.activated_at < m."createdAt") activation_predates_membership,
    percentile_cont(.5) WITHIN GROUP (ORDER BY extract(epoch FROM (fa.activated_at-m."createdAt"))/86400.0)
      FILTER(WHERE m.role='TEACHER' AND fa.activated_at>=m."createdAt") median_activation_days,
    count(DISTINCT m.id) FILTER(WHERE m.role='TEACHER' AND fa.activated_at>=m."createdAt") activation_speed_sample
  FROM schools s LEFT JOIN member_schools ms ON ms.school_id=s.id LEFT JOIN eligible_members m ON m.id=ms.membership_id
  LEFT JOIN first_activation fa ON fa.school_id=s.id AND fa.membership_id=m.id GROUP BY s.id
),
usage AS (
  SELECT pe.grain,pe.period,pe.period>=p.start_at AND pe.period_end<=p.as_of complete,s.id school_id,
    count(DISTINCT e.event_id) FILTER(WHERE e.kind='assignment') assignment_deployments,
    count(DISTINCT e.assignment_id) FILTER(WHERE e.kind='assignment') distinct_assignments,
    count(*) FILTER(WHERE e.kind='submission') submissions,
    count(DISTINCT e.document_id) FILTER(WHERE e.kind='submission') submitted_documents,
    count(DISTINCT e.membership_id) FILTER(WHERE e.kind='submission') student_submitters,
    count(*) FILTER(WHERE e.kind='submission' AND e.attribution='current_membership_inferred') inferred_school_submissions,
    count(*) FILTER(WHERE e.kind='graded') graded_submissions,
    count(*) FILTER(WHERE e.kind='released') released_submissions,
    count(*) FILTER(WHERE e.kind='submission' AND e.submission_number>1) resubmissions,
    count(DISTINCT e.membership_id) FILTER(WHERE e.kind IN ('submission','student_save')) students_with_save_or_submit,
    count(DISTINCT e.document_id) FILTER(WHERE e.kind='student_save') saved_documents,
    count(*) FILTER(WHERE e.kind='document_created') documents_created,
    count(DISTINCT e.membership_id) FILTER(WHERE e.kind='document_created') document_creators,
    count(*) FILTER(WHERE e.kind='student_tutor_message') student_tutor_messages,
    count(DISTINCT e.membership_id) FILTER(WHERE e.kind='student_tutor_message') student_tutor_users,
    count(*) FILTER(WHERE e.kind='student_comment_reply') student_comment_replies,
    count(DISTINCT e.membership_id) FILTER(WHERE e.kind IN ('student_tutor_message','student_comment_reply','student_save','submission')) students_with_observed_activity
  FROM periods pe CROSS JOIN params p CROSS JOIN schools s
  LEFT JOIN events e ON e.school_id=s.id AND e.at>=greatest(pe.period,p.start_at) AND e.at<least(pe.period_end,p.as_of)
  GROUP BY pe.grain,pe.period,pe.period_end,p.as_of,p.start_at,s.id
),
teacher_usage AS (
  SELECT pe.grain,pe.period,s.id school_id,
    count(DISTINCT t.membership_id) FILTER(WHERE t.kind='direct_feedback') direct_feedback_teachers,
    count(DISTINCT t.membership_id) FILTER(WHERE t.kind='classroom_submission') teachers_with_class_submissions,
    count(DISTINCT t.membership_id) FILTER(WHERE t.kind='classroom_assignment') teachers_with_class_assignments,
    count(DISTINCT t.membership_id) teachers_with_any_signal
  FROM periods pe CROSS JOIN params p CROSS JOIN schools s
  LEFT JOIN teacher_events t ON t.school_id=s.id AND t.at>=greatest(pe.period,p.start_at) AND t.at<least(pe.period_end,p.as_of)
  GROUP BY pe.grain,pe.period,s.id
)
SELECT json_build_object(
  'meta',json_build_object('as_of',(SELECT as_of FROM params),'timezone','UTC','read_only',current_setting('transaction_read_only'),
    'start_at',(SELECT start_at FROM params),'lookback_months',:lookback_months::int,'school_year',(SELECT school_year FROM params),'definition_version','mind-v2-history'),
  'organizations',(SELECT json_agg(x ORDER BY x.organization) FROM (
    SELECT o.id organization_id,o.name organization,o."numOfTeacherSeats" configured_teacher_seats,o."numOfStudentSeats" configured_student_seats,
      o."accessExpiresAt" access_expires_at,(SELECT count(*) FROM real_schools s WHERE s."organizationId"=o.id) school_records,
      count(m.id) FILTER(WHERE m.role='TEACHER') registered_teachers,count(m.id) FILTER(WHERE m.role='STUDENT') registered_students,
      count(m.id) FILTER(WHERE m.role='TEACHER' AND m."isActive") enabled_teachers,count(m.id) FILTER(WHERE m.role='STUDENT' AND m."isActive") enabled_students
    FROM orgs o LEFT JOIN eligible_members m ON m."organizationId"=o.id GROUP BY o.id,o.name,o."numOfTeacherSeats",o."numOfStudentSeats",o."accessExpiresAt"
  )x),
  'schools',(SELECT json_agg(x ORDER BY x.organization,x.school) FROM (
    SELECT s.id school_id,s.name school,o.name organization,s.real_school,sc.registered_teachers,sc.enabled_teachers,
      sc.registered_students,sc.enabled_students,sc.activated_teachers,sc.setup_teachers,sc.median_activation_days,sc.activation_speed_sample,sc.activation_predates_membership,
      (SELECT count(*) FROM "Class" c WHERE c."schoolId"=s.id) retained_classes,
      (SELECT count(*) FROM "Class" c WHERE c."schoolId"=s.id AND c."schoolYear"=(SELECT school_year FROM params) AND NOT c."isArchived") current_year_classes,
      (SELECT count(DISTINCT j."B") FROM "_ClassStudents" j JOIN "Class" c ON c.id=j."A" JOIN eligible_members m ON m.id=j."B"
       WHERE c."schoolId"=s.id AND c."schoolYear"=(SELECT school_year FROM params) AND NOT c."isArchived" AND m.role='STUDENT') current_year_students
    FROM schools s JOIN orgs o ON o.id=s."organizationId" JOIN school_counts sc ON sc.school_id=s.id
  )x),
  'usage',(SELECT json_agg(x ORDER BY x.grain,x.period,x.school_id) FROM (
    SELECT u.grain,to_char(u.period,'YYYY-MM-DD') period,u.complete,u.school_id,u.assignment_deployments,u.distinct_assignments,
      u.submissions,u.submitted_documents,u.student_submitters,u.inferred_school_submissions,u.graded_submissions,u.released_submissions,u.resubmissions,
      u.students_with_save_or_submit,u.saved_documents,t.direct_feedback_teachers,t.teachers_with_class_submissions,t.teachers_with_class_assignments,t.teachers_with_any_signal
      ,u.documents_created,u.document_creators,u.student_tutor_messages,u.student_tutor_users,u.student_comment_replies,u.students_with_observed_activity
    FROM usage u JOIN teacher_usage t USING(grain,period,school_id)
  )x),
  'activation_cohorts',(SELECT json_agg(x ORDER BY x.cohort,x.school_id) FROM (
    SELECT ms.school_id,to_char(date_trunc('month',m."createdAt"),'YYYY-MM-DD') cohort,count(*) registered_teachers,
      count(*) FILTER(WHERE fa.activated_at IS NOT NULL) activated_to_date,
      count(*) FILTER(WHERE m."createdAt" <= p.as_of-interval '30 days') eligible_30_days,
      count(*) FILTER(WHERE m."createdAt" <= p.as_of-interval '30 days' AND fa.activated_at>=m."createdAt" AND fa.activated_at<=m."createdAt"+interval '30 days') activated_within_30_days
    FROM member_schools ms JOIN schools s ON s.id=ms.school_id JOIN eligible_members m ON m.id=ms.membership_id AND m.role='TEACHER'
    LEFT JOIN first_activation fa ON fa.school_id=ms.school_id AND fa.membership_id=m.id CROSS JOIN params p GROUP BY 1,2
  )x),
  'portfolio_usage',(SELECT json_agg(x ORDER BY x.grain,x.period) FROM (
    SELECT pe.grain,to_char(pe.period,'YYYY-MM-DD') period,pe.period>=p.start_at AND pe.period_end<=p.as_of complete,
      (SELECT count(*) FROM events e WHERE e.kind='submission' AND e.at>=greatest(pe.period,p.start_at) AND e.at<least(pe.period_end,p.as_of)) submissions,
      (SELECT count(DISTINCT e.membership_id) FROM events e WHERE e.kind='submission' AND e.at>=greatest(pe.period,p.start_at) AND e.at<least(pe.period_end,p.as_of)) student_submitters,
      (SELECT count(DISTINCT e.membership_id) FROM events e WHERE e.kind IN ('submission','student_save') AND e.at>=greatest(pe.period,p.start_at) AND e.at<least(pe.period_end,p.as_of)) students_with_save_or_submit,
      (SELECT count(DISTINCT t.membership_id) FROM teacher_events t WHERE t.kind='direct_feedback' AND t.at>=greatest(pe.period,p.start_at) AND t.at<least(pe.period_end,p.as_of)) direct_feedback_teachers,
      (SELECT count(DISTINCT t.membership_id) FROM teacher_events t WHERE t.at>=greatest(pe.period,p.start_at) AND t.at<least(pe.period_end,p.as_of)) teachers_with_any_signal,
      (SELECT count(DISTINCT e.school_id) FROM events e JOIN schools s ON s.id=e.school_id AND s.real_school WHERE e.kind='submission' AND e.at>=greatest(pe.period,p.start_at) AND e.at<least(pe.period_end,p.as_of)) schools_with_submissions
      ,(SELECT count(DISTINCT e.membership_id) FROM events e WHERE e.kind='student_tutor_message' AND e.at>=greatest(pe.period,p.start_at) AND e.at<least(pe.period_end,p.as_of)) student_tutor_users
      ,(SELECT count(DISTINCT e.membership_id) FROM events e WHERE e.kind IN ('student_tutor_message','student_comment_reply','student_save','submission') AND e.at>=greatest(pe.period,p.start_at) AND e.at<least(pe.period_end,p.as_of)) students_with_observed_activity
    FROM periods pe CROSS JOIN params p
  )x),
  'registration_cohorts',(SELECT json_agg(x ORDER BY x.cohort,x.school_id) FROM (
    SELECT ms.school_id,to_char(date_trunc('month',m."createdAt"),'YYYY-MM-DD') cohort,
      count(*) FILTER(WHERE m.role='TEACHER') teacher_memberships_created,
      count(*) FILTER(WHERE m.role='STUDENT') student_memberships_created
    FROM member_schools ms JOIN schools s ON s.id=ms.school_id JOIN eligible_members m ON m.id=ms.membership_id GROUP BY 1,2
  )x),
  'licenses',(SELECT json_agg(x) FROM (
    SELECT o.name organization,l.cohort,l.status,l.source,count(*) license_rows,
      count(*) FILTER(WHERE l.status='ACTIVE' AND l."validUntil">p.as_of AND l."revokedAt" IS NULL) valid_active_license_rows,
      sum(l."amountPaid") amount_paid_minor_units,l.currency,min(l."validUntil") earliest_valid_until
    FROM "StudentLicense" l JOIN orgs o ON o.id=l."organizationId" CROSS JOIN params p GROUP BY 1,2,3,4,l.currency
  )x),
  'window_totals',json_build_object(
    'documents_created',(SELECT count(*) FROM events e CROSS JOIN params p WHERE kind='document_created' AND at>=p.start_at AND at<p.as_of),
    'student_tutor_messages',(SELECT count(*) FROM events e CROSS JOIN params p WHERE kind='student_tutor_message' AND at>=p.start_at AND at<p.as_of),
    'unique_student_tutor_users',(SELECT count(DISTINCT membership_id) FROM events e CROSS JOIN params p WHERE kind='student_tutor_message' AND at>=p.start_at AND at<p.as_of),
    'unique_students_with_observed_activity',(SELECT count(DISTINCT membership_id) FROM events e CROSS JOIN params p WHERE kind IN ('student_tutor_message','student_comment_reply','student_save','submission') AND at>=p.start_at AND at<p.as_of),
    'submissions',(SELECT count(*) FROM events e CROSS JOIN params p WHERE kind='submission' AND at>=p.start_at AND at<p.as_of),
    'unique_teacher_feedback_actors',(SELECT count(DISTINCT membership_id) FROM teacher_events e CROSS JOIN params p WHERE kind='direct_feedback' AND at>=p.start_at AND at<p.as_of)
  ),
  'school_window_totals',(SELECT json_agg(x ORDER BY x.school_id) FROM (
    SELECT s.id school_id,
      count(*) FILTER(WHERE e.kind='document_created') documents_created,
      count(*) FILTER(WHERE e.kind='student_tutor_message') student_tutor_messages,
      count(DISTINCT e.membership_id) FILTER(WHERE e.kind IN ('student_tutor_message','student_comment_reply','student_save','submission')) students_with_observed_activity,
      count(*) FILTER(WHERE e.kind='submission') submissions,
      (SELECT count(DISTINCT t.membership_id) FROM teacher_events t CROSS JOIN params tp WHERE t.school_id=s.id AND t.kind='direct_feedback' AND t.at>=tp.start_at AND t.at<tp.as_of) teacher_feedback_actors
    FROM schools s CROSS JOIN params p LEFT JOIN events e ON e.school_id=s.id AND e.at>=p.start_at AND e.at<p.as_of GROUP BY s.id
  )x),
  'quality',json_build_object(
    'all_submissions',(SELECT count(*) FROM "Submission" CROSS JOIN params p WHERE "submittedAt"<p.as_of),
    'included_submissions',(SELECT count(*) FROM submissions),
    'excluded_submissions',(SELECT count(*) FROM "Submission" s CROSS JOIN params p WHERE s."submittedAt"<p.as_of AND NOT EXISTS(SELECT 1 FROM submissions i WHERE i.id=s.id)),
    'attribution',(SELECT json_agg(x) FROM (SELECT attribution,count(*) submissions FROM submissions GROUP BY 1)x),
    'unsubmitted_retained',(SELECT count(*) FROM submissions WHERE "unsubmittedAt" IS NOT NULL),
    'excluded_organizations',(SELECT count(*) FROM excluded_orgs),
    'excluded_or_unverified_school_labels',(SELECT count(*) FROM excluded_schools),
    'all_memberships',(SELECT count(*) FROM "OrgMembership"),
    'eligible_memberships',(SELECT count(*) FROM eligible_members),
    'unique_activated_teacher_memberships',(SELECT count(DISTINCT membership_id) FROM first_activation WHERE activated_at IS NOT NULL),
    'unique_registered_teacher_memberships',(SELECT count(*) FROM eligible_members WHERE role='TEACHER'),
    'multi_school_memberships',(SELECT count(*) FROM (SELECT membership_id FROM member_schools GROUP BY 1 HAVING count(*)>1)x),
    'coverage',(SELECT json_agg(x) FROM (
      SELECT 'retained_submissions' source,min("submittedAt") earliest,max("submittedAt") latest FROM submissions
      UNION ALL SELECT 'retained_class_assignments',min(at),max(at) FROM events WHERE kind='assignment'
      UNION ALL SELECT 'student_save_journal',min(at),max(at) FROM events WHERE kind='student_save'
      UNION ALL SELECT 'submission_audit',min("createdAt"),max("createdAt") FROM "SubmissionActivity"
      UNION ALL SELECT 'document_creation',min(at),max(at) FROM events WHERE kind='document_created'
      UNION ALL SELECT 'student_tutor_messages',min(at),max(at) FROM events WHERE kind='student_tutor_message'
      UNION ALL SELECT 'student_comment_replies',min(at),max(at) FROM events WHERE kind='student_comment_reply'
      UNION ALL SELECT 'teacher_feedback',min(at),max(at) FROM teacher_events WHERE kind='direct_feedback'
    )x)
  )
);
ROLLBACK;
