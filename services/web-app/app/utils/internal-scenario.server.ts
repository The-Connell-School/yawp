import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@app/prisma';
import { z } from 'zod';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const environment = z.enum(['preview', 'demo']);
const bindingSchema = z.object({ environment, targetId: id, organizationId: id }).strict();
const inputSchema = z.object({
  jobId: id, actorId: id, fingerprint: z.string().regex(/^[a-f0-9]{64}$/), mode: z.enum(['populate', 'reset']),
  target: z.object({ id, environment, organizationId: id.optional(), url: z.string().url().optional(), revision: z.string().regex(/^[a-f0-9]{40}$/).optional() }).strict(),
  recipe: z.object({ teachers: z.number().int().min(1).max(20), students: z.number().int().min(0).max(200),
    classes: z.number().int().min(1).max(20), assignmentsPerClass: z.number().int().min(0).max(20),
    submissions: z.enum(['empty', 'draft', 'submitted', 'mixed']) }).strict(),
}).strict();
const resourcesSchema = z.object({ users: z.array(id), memberships: z.array(id), classes: z.array(id), assignments: z.array(id), documents: z.array(id), submissions: z.array(id), schoolId: id });
const receiptSchema = z.object({ jobId: id, targetId: id, fingerprint: z.string(), counts: z.object({ users: z.number(), classes: z.number(), assignments: z.number(), submissions: z.number() }) });
type Db = InstanceType<typeof PrismaClient>;

/** Invoked only by the trusted runner, with operator-owned target binding and DB credentials. */
export class InternalScenarios {
  private binding: z.infer<typeof bindingSchema>;
  constructor(private db: Db, binding: z.input<typeof bindingSchema>) { this.binding = bindingSchema.parse(binding); }
  async apply(raw: z.input<typeof inputSchema>) {
    const input = inputSchema.parse(raw), scope = this.binding;
    if (input.target.environment !== scope.environment || input.target.id !== scope.targetId ||
        (input.target.organizationId !== undefined && input.target.organizationId !== scope.organizationId)) throw new Error('Target does not match trusted binding');
    const requestHash = createHash('sha256').update(JSON.stringify({ input, scope })).digest('hex');
    return this.db.$transaction(async tx => {
      // Consistent job then organization locking makes duplicate and cross-target writes serial.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`scenario-job:${input.jobId}`}, 0))`;
      const prior = await tx.internalScenarioReceipt.findUnique({ where: { jobId: input.jobId } });
      if (prior) {
        if (prior.requestHash !== requestHash) throw new Error('Idempotency key used with different inputs');
        return receiptSchema.parse(prior.receipt);
      }
      const [org] = await tx.$queryRaw<Array<{ id: string; numOfTeacherSeats: number; numOfStudentSeats: number }>>`
        SELECT id, "numOfTeacherSeats", "numOfStudentSeats" FROM "Organization" WHERE id=${scope.organizationId} FOR UPDATE`;
      if (!org) throw new Error('Target organization missing');
      if (input.mode === 'reset') {
        const previous = await tx.internalScenarioReceipt.findMany({ where: { targetId: scope.targetId, environment: scope.environment, organizationId: org.id, retiredAt: null } });
        const now = new Date();
        for (const row of previous) {
          const owned = resourcesSchema.parse(row.resources);
          // Never traverse relationships to collect additional resources for cleanup.
          await tx.class.updateMany({ where: { id: { in: owned.classes }, school: { organizationId: org.id } }, data: { isArchived: true } });
          await tx.document.updateMany({ where: { id: { in: owned.documents }, membership: { organizationId: org.id } }, data: { archivedAt: now } });
          await tx.orgMembership.updateMany({ where: { id: { in: owned.memberships }, organizationId: org.id }, data: { isActive: false } });
          await tx.internalScenarioReceipt.update({ where: { jobId: row.jobId }, data: { retiredAt: now, retiredByJobId: input.jobId } });
        }
      }
      for (const role of ['TEACHER', 'STUDENT'] as const) {
        const requested = role === 'TEACHER' ? input.recipe.teachers : input.recipe.students;
        const count = await tx.orgMembership.count({ where: { organizationId: org.id, isActive: true, role } });
        if (count + requested > (role === 'TEACHER' ? org.numOfTeacherSeats : org.numOfStudentSeats)) throw new Error('Organization seat limit exceeded');
      }
      // Use a real available rubric/template; do not invent grading configuration.
      const assignmentType = await tx.assignmentType.findFirst({ where: { archivedAt: null, ownerMembershipId: null, OR: [{ ownerOrgId: null }, { ownerOrgId: org.id }] }, orderBy: [{ position: 'asc' }, { id: 'asc' }] });
      if (!assignmentType && input.recipe.assignmentsPerClass > 0) throw new Error('No compatible assignment type');
      const resources: z.infer<typeof resourcesSchema> = { users: [], memberships: [], classes: [], assignments: [], documents: [], submissions: [], schoolId: randomUUID() };
      await tx.school.create({ data: { id: resources.schoolId, organizationId: org.id, name: 'Scenario classroom', code: `scenario-${resources.schoolId}` } });
      const teachers: string[] = [], students: string[] = [];
      for (const role of ['TEACHER', 'STUDENT'] as const) {
        const count = role === 'TEACHER' ? input.recipe.teachers : input.recipe.students;
        for (let index = 0; index < count; index++) {
          const userId = randomUUID(), membershipId = randomUUID();
          await tx.user.create({ data: { id: userId, email: `scenario-${userId}@yawp.invalid`, name: `Scenario ${role === 'TEACHER' ? 'Teacher' : 'Student'} ${index + 1}`,
            memberships: { create: { id: membershipId, organizationId: org.id, role, ...(role === 'TEACHER' ? { schools: { connect: { id: resources.schoolId } } } : {}) } } } });
          resources.users.push(userId); resources.memberships.push(membershipId);
          (role === 'TEACHER' ? teachers : students).push(membershipId);
        }
      }
      for (let c = 0; c < input.recipe.classes; c++) {
        const classroom = await tx.class.create({ data: { schoolId: resources.schoolId, code: `scenario-${c + 1}`, title: `Scenario Class ${c + 1}`, schoolYear: `${new Date().getUTCFullYear()}-${new Date().getUTCFullYear() + 1}`,
          teachers: { connect: teachers.map(id => ({ id })) }, students: { connect: students.map(id => ({ id })) } } });
        resources.classes.push(classroom.id);
        for (let a = 0; a < input.recipe.assignmentsPerClass; a++) {
          const assignment = await tx.assignment.create({ data: { assignmentTypeId: assignmentType!.id, title: `Scenario Assignment ${a + 1}`, prompt: 'Explain how evidence supports an argument.' } });
          resources.assignments.push(assignment.id);
          const deployment = await tx.classAssignment.create({ data: { classId: classroom.id, assignmentId: assignment.id } });
          if (input.recipe.submissions === 'empty') continue;
          for (const [s, membershipId] of students.entries()) {
            const text = 'Evidence helps a reader evaluate a claim. Specific examples make an argument clearer.';
            const html = `<p>${text}</p>`;
            const document = await tx.document.create({ data: { membershipId, assignmentId: assignment.id, classAssignmentId: deployment.id, assignmentTypeId: assignmentType!.id, title: 'Scenario draft', text, html } });
            resources.documents.push(document.id);
            if (input.recipe.submissions === 'submitted' || (input.recipe.submissions === 'mixed' && s % 2 === 0)) {
              const submission = await tx.submission.create({ data: { documentId: document.id, title: document.title, text, html, submittedAt: new Date() } });
              resources.submissions.push(submission.id);
            }
          }
        }
      }
      const receipt = { jobId: input.jobId, targetId: scope.targetId, fingerprint: input.fingerprint,
        counts: { users: resources.users.length, classes: resources.classes.length, assignments: resources.assignments.length, submissions: resources.submissions.length } };
      await tx.internalScenarioReceipt.create({ data: { jobId: input.jobId, actorId: input.actorId, targetId: scope.targetId, environment: scope.environment,
        organizationId: org.id, fingerprint: input.fingerprint, requestHash, resources, receipt } });
      return receipt;
    }, { timeout: 600000, maxWait: 10000 });
  }
}
