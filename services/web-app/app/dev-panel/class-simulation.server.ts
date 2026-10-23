import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { getUserId } from '~/utils/auth.server';
import {
  lockClassCollaborationDeployments,
  lockStudentRosters,
} from '~/domain/collaboration/class-assignment-lock.server';
import { FreeClassSeatError } from '~/domain/free-tier/free-class-seat-error';
import {
  buildAssignmentModuleSessionCreateData,
} from '~/domain/documents.server';
import {
  classSimulationAssignmentState,
  classSimulationShouldIncludeTutorChat,
  parseSimulatedStudentIndex,
  simulatedStudentDisplayName,
  simulatedStudentEmail,
  SIMULATION_PARTIAL_TEXT,
  SIMULATION_SUBMITTED_TEXT,
  SIMULATION_TUTOR_TRANSCRIPT,
  type ClassSimulationAssignmentState,
  CLASS_SIMULATION_MAX_STUDENTS,
} from './class-simulation-mix';

export { CLASS_SIMULATION_MAX_STUDENTS };
export const CLASS_SIMULATION_TRANSACTION_MS = 120_000;

export type ClassSimulationCounts = {
  students: number;
  assignments: number;
  documentsCreated: number;
  documentsUpdated: number;
  submissionsCreated: number;
  tutorSessionsUpdated: number;
};

async function ensureSimulatedStudentEnrolledInClass(
  tx: Prisma.TransactionClient,
  params: { membershipId: string; classId: string }
) {
  const already = await tx.orgMembership.findFirst({
    where: {
      id: params.membershipId,
      classesAsStudent: { some: { id: params.classId } },
    },
    select: { id: true },
  });
  if (already) return { ok: true as const };
  await lockStudentRosters(tx, [params.membershipId]);
  await lockClassCollaborationDeployments(tx, params.classId);
  await tx.orgMembership.update({
    where: { id: params.membershipId },
    data: { classesAsStudent: { connect: { id: params.classId } } },
  });
  return { ok: true as const };
}

export async function listDevPanelTeacherClasses(request: Request) {
  const userId = await getUserId(request);
  if (!userId) {
    return { ok: false as const, status: 401 as const, error: 'Sign in required.' };
  }
  const membership = await prisma.orgMembership.findFirst({
    where: { userId, isActive: true, role: 'TEACHER' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!membership) {
    return { ok: false as const, status: 403 as const, error: 'Teacher sign-in required.' };
  }
  const classes = await prisma.class.findMany({
    where: {
      isArchived: false,
      teachers: { some: { id: membership.id } },
    },
    orderBy: [{ schoolYear: 'desc' }, { title: 'asc' }],
    select: { id: true, title: true, code: true, schoolYear: true },
  });
  const counts = await prisma.user.groupBy({
    by: ['simulatedForClassId'],
    where: {
      simulatedForClassId: { in: classes.map((entry) => entry.id) },
    },
    _count: { _all: true },
  });
  const countByClass = new Map(
    counts.map((row) => [row.simulatedForClassId!, row._count._all])
  );
  return {
    ok: true as const,
    classes: classes.map((entry) => ({
      ...entry,
      simulatedStudentCount: countByClass.get(entry.id) ?? 0,
    })),
  };
}

export async function assertTeacherOwnsClass(params: {
  userId: string;
  classId: string;
}) {
  const membership = await prisma.orgMembership.findFirst({
    where: {
      userId: params.userId,
      isActive: true,
      role: 'TEACHER',
      classesAsTeacher: { some: { id: params.classId } },
    },
    select: {
      id: true,
      organizationId: true,
    },
  });
  if (!membership) {
    return null;
  }
  const klass = await prisma.class.findFirst({
    where: {
      id: params.classId,
      isArchived: false,
      teachers: { some: { id: membership.id } },
    },
    select: {
      id: true,
      schoolId: true,
      school: { select: { organizationId: true } },
    },
  });
  if (!klass) return null;
  return { membership, klass };
}

async function loadClassAssignments(tx: Prisma.TransactionClient, classId: string) {
  return tx.classAssignment.findMany({
    where: { classId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      assignmentId: true,
      assignment: {
        select: {
          assignmentTypeId: true,
          title: true,
        },
      },
    },
  });
}

async function loadAssignmentModules(
  tx: Prisma.TransactionClient,
  assignmentTypeId: string
) {
  return tx.assignmentModule.findMany({
    where: { assignmentTypeId, deletedAt: null },
    orderBy: { position: 'asc' },
    include: {
      instructions: { orderBy: { position: 'asc' }, select: { id: true, prompt: true } },
    },
  });
}

async function deleteSimulatedUser(
  tx: Prisma.TransactionClient,
  params: { userId: string; classId: string; membershipIds: string[] }
) {
  for (const membershipId of params.membershipIds) {
    const documents = await tx.document.findMany({
      where: { membershipId },
      select: { id: true },
    });
    const documentIds = documents.map((d) => d.id);
    if (documentIds.length) {
      const submissions = await tx.submission.findMany({
        where: { documentId: { in: documentIds } },
        select: { id: true },
      });
      const submissionIds = submissions.map((s) => s.id);
      if (submissionIds.length) {
        await tx.submissionActivity.deleteMany({
          where: { submissionId: { in: submissionIds } },
        });
        await tx.submissionGradingAssistantRun.deleteMany({
          where: { submissionId: { in: submissionIds } },
        });
        await tx.submissionComment.deleteMany({
          where: { submissionId: { in: submissionIds } },
        });
        await tx.submission.deleteMany({ where: { id: { in: submissionIds } } });
      }
      await tx.assignmentModuleSessionMessage.deleteMany({
        where: {
          assignmentModuleSession: { documentId: { in: documentIds } },
        },
      });
      await tx.assignmentModuleSession.deleteMany({
        where: { documentId: { in: documentIds } },
      });
      await tx.document.deleteMany({ where: { id: { in: documentIds } } });
    }
    await tx.orgMembership.update({
      where: { id: membershipId },
      data: { classesAsStudent: { disconnect: { id: params.classId } } },
    });
    await tx.orgMembership.delete({ where: { id: membershipId } });
  }
  await tx.user.delete({ where: { id: params.userId } });
}

async function deleteSimulatedUsersForClass(
  tx: Prisma.TransactionClient,
  classId: string
) {
  const users = await tx.user.findMany({
    where: { simulatedForClassId: classId },
    select: {
      id: true,
      memberships: { select: { id: true } },
    },
  });
  for (const user of users) {
    await deleteSimulatedUser(tx, {
      userId: user.id,
      classId,
      membershipIds: user.memberships.map((m) => m.id),
    });
  }
  return users.length;
}

async function applyAssignmentState(
  tx: Prisma.TransactionClient,
  params: {
    state: ClassSimulationAssignmentState;
    membershipId: string;
    studentIndex: number;
    assignmentIndex: number;
    classAssignment: Awaited<ReturnType<typeof loadClassAssignments>>[number];
    assignmentModules: Awaited<ReturnType<typeof loadAssignmentModules>>;
    counts: ClassSimulationCounts;
  }
) {
  const { classAssignment, assignmentModules } = params;
  const assignmentTypeId = classAssignment.assignment.assignmentTypeId;

  const existing = await tx.document.findFirst({
    where: {
      membershipId: params.membershipId,
      classAssignmentId: classAssignment.id,
      deletedAt: null,
      archivedAt: null,
    },
    select: {
      id: true,
      text: true,
      submissions: {
        where: { unsubmittedAt: null, archivedAt: null },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { id: true },
      },
      assignmentModuleSessions: {
        select: { id: true, assignmentModuleId: true, messages: { select: { id: true } } },
      },
    },
  });

  if (params.state === 'not_joined') {
    if (existing) {
      const submissionIds = (
        await tx.submission.findMany({
          where: { documentId: existing.id },
          select: { id: true },
        })
      ).map((s) => s.id);
      if (submissionIds.length) {
        await tx.submissionActivity.deleteMany({
          where: { submissionId: { in: submissionIds } },
        });
        await tx.submissionGradingAssistantRun.deleteMany({
          where: { submissionId: { in: submissionIds } },
        });
        await tx.submissionComment.deleteMany({
          where: { submissionId: { in: submissionIds } },
        });
        await tx.submission.deleteMany({ where: { id: { in: submissionIds } } });
      }
      await tx.assignmentModuleSessionMessage.deleteMany({
        where: { assignmentModuleSession: { documentId: existing.id } },
      });
      await tx.assignmentModuleSession.deleteMany({ where: { documentId: existing.id } });
      await tx.document.delete({ where: { id: existing.id } });
    }
    return;
  }

  let documentId = existing?.id;
  if (!documentId) {
    const created = await tx.document.create({
      data: {
        membershipId: params.membershipId,
        text: '',
        html: '',
        title: classAssignment.assignment.title || 'Untitled',
        assignmentTypeId,
        assignmentId: classAssignment.assignmentId,
        classAssignmentId: classAssignment.id,
        assignmentModuleSessions: {
          create: buildAssignmentModuleSessionCreateData(assignmentModules),
        },
      },
      select: { id: true },
    });
    documentId = created.id;
    params.counts.documentsCreated += 1;
  }

  const partialHtml = `<p>${SIMULATION_PARTIAL_TEXT}</p>`;
  const submittedHtml = `<p>${SIMULATION_SUBMITTED_TEXT}</p>`;

  if (params.state === 'joined') {
    await tx.document.update({
      where: { id: documentId },
      data: { text: '', html: '', title: classAssignment.assignment.title || 'Untitled' },
    });
    const submissionIds = (
      await tx.submission.findMany({
        where: { documentId },
        select: { id: true },
      })
    ).map((s) => s.id);
    if (submissionIds.length) {
      await tx.submissionActivity.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });
      await tx.submissionGradingAssistantRun.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });
      await tx.submissionComment.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });
      await tx.submission.deleteMany({ where: { id: { in: submissionIds } } });
    }
    params.counts.documentsUpdated += 1;
  } else if (params.state === 'in_progress') {
    await tx.document.update({
      where: { id: documentId },
      data: {
        text: SIMULATION_PARTIAL_TEXT,
        html: partialHtml,
        title: classAssignment.assignment.title || 'Untitled',
      },
    });
    const submissionIds = (
      await tx.submission.findMany({
        where: { documentId },
        select: { id: true },
      })
    ).map((s) => s.id);
    if (submissionIds.length) {
      await tx.submissionActivity.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });
      await tx.submissionGradingAssistantRun.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });
      await tx.submissionComment.deleteMany({
        where: { submissionId: { in: submissionIds } },
      });
      await tx.submission.deleteMany({ where: { id: { in: submissionIds } } });
    }
    params.counts.documentsUpdated += 1;
  } else {
    await tx.document.update({
      where: { id: documentId },
      data: {
        text: SIMULATION_SUBMITTED_TEXT,
        html: submittedHtml,
        title: classAssignment.assignment.title || 'Untitled',
      },
    });
    params.counts.documentsUpdated += 1;
    const hasSubmission = existing?.submissions?.length;
    if (!hasSubmission) {
      await tx.submission.create({
        data: {
          documentId,
          title: classAssignment.assignment.title || 'Untitled',
          text: SIMULATION_SUBMITTED_TEXT,
          html: submittedHtml,
          submittedAt: new Date(),
        },
      });
      params.counts.submissionsCreated += 1;
    } else {
      await tx.submission.update({
        where: { id: existing!.submissions[0]!.id },
        data: {
          text: SIMULATION_SUBMITTED_TEXT,
          html: submittedHtml,
          title: classAssignment.assignment.title || 'Untitled',
          unsubmittedAt: null,
          archivedAt: null,
        },
      });
    }
  }

  if (classSimulationShouldIncludeTutorChat(params.studentIndex)) {
    const sessions = await tx.assignmentModuleSession.findMany({
      where: { documentId },
      include: {
        assignmentModule: {
          include: {
            instructions: { orderBy: { position: 'asc' }, take: 1 },
          },
        },
        messages: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 1,
    });
    const session = sessions[0];
    if (session) {
      const firstInstruction = session.assignmentModule.instructions[0];
      const baseInstructionId =
        firstInstruction?.id ?? session.messages[0]?.instructionId;
      if (baseInstructionId) {
        await tx.assignmentModuleSessionMessage.deleteMany({
          where: { assignmentModuleSessionId: session.id },
        });
        for (const turn of SIMULATION_TUTOR_TRANSCRIPT) {
          await tx.assignmentModuleSessionMessage.create({
            data: {
              assignmentModuleSessionId: session.id,
              instructionId: baseInstructionId,
              agent: turn.agent,
              content: turn.content,
            },
          });
        }
        params.counts.tutorSessionsUpdated += 1;
      }
    }
  }
}

export async function populateDevPanelClassSimulation(params: {
  userId: string;
  classId: string;
  studentCount: number;
}) {
  if (
    params.studentCount < 1 ||
    params.studentCount > CLASS_SIMULATION_MAX_STUDENTS
  ) {
    return {
      ok: false as const,
      status: 400 as const,
      error: `Student count must be between 1 and ${CLASS_SIMULATION_MAX_STUDENTS}.`,
    };
  }
  const owned = await assertTeacherOwnsClass({
    userId: params.userId,
    classId: params.classId,
  });
  if (!owned) {
    return { ok: false as const, status: 403 as const, error: 'Class not found.' };
  }

  const counts: ClassSimulationCounts = {
    students: 0,
    assignments: 0,
    documentsCreated: 0,
    documentsUpdated: 0,
    submissionsCreated: 0,
    tutorSessionsUpdated: 0,
  };

  try {
  const summary = await prisma.$transaction(
    async (tx) => {
      const classAssignments = await loadClassAssignments(tx, params.classId);
      counts.assignments = classAssignments.length;

      const existingSimUsers = await tx.user.findMany({
        where: { simulatedForClassId: params.classId },
        select: { id: true, email: true, memberships: { select: { id: true } } },
      });

      for (const user of existingSimUsers) {
        const index = parseSimulatedStudentIndex(user.email, params.classId);
        if (index == null || index > params.studentCount) {
          await deleteSimulatedUser(tx, {
            userId: user.id,
            classId: params.classId,
            membershipIds: user.memberships.map((m) => m.id),
          });
        }
      }

      const refreshed = await tx.user.findMany({
        where: { simulatedForClassId: params.classId },
        select: { id: true, email: true, memberships: { select: { id: true } } },
      });
      const refreshedByIndex = new Map<number, (typeof refreshed)[number]>();
      for (const user of refreshed) {
        const index = parseSimulatedStudentIndex(user.email, params.classId);
        if (index != null) refreshedByIndex.set(index, user);
      }

      const organizationId = owned.klass.school.organizationId;

      for (let studentIndex = 1; studentIndex <= params.studentCount; studentIndex++) {
        let simUser = refreshedByIndex.get(studentIndex);
        const email = simulatedStudentEmail(params.classId, studentIndex);
        const name = simulatedStudentDisplayName(studentIndex);

        if (!simUser) {
          simUser = await tx.user.create({
            data: {
              email,
              name,
              simulatedForClassId: params.classId,
              memberships: {
                create: {
                  organizationId,
                  role: 'STUDENT',
                  isActive: true,
                },
              },
            },
            select: {
              id: true,
              email: true,
              memberships: { select: { id: true } },
            },
          });
        } else {
          await tx.user.update({
            where: { id: simUser.id },
            data: { name, simulatedForClassId: params.classId },
          });
        }

        const membershipId = simUser.memberships[0]?.id;
        if (!membershipId) {
          throw new Error('Simulated student missing membership.');
        }

        await ensureSimulatedStudentEnrolledInClass(tx, {
          membershipId,
          classId: params.classId,
        });

        const modulesByType = new Map<
          string,
          Awaited<ReturnType<typeof loadAssignmentModules>>
        >();

        for (const [assignmentIndex, classAssignment] of classAssignments.entries()) {
          const typeId = classAssignment.assignment.assignmentTypeId;
          if (!modulesByType.has(typeId)) {
            modulesByType.set(typeId, await loadAssignmentModules(tx, typeId));
          }
          const state = classSimulationAssignmentState(studentIndex, assignmentIndex);
          await applyAssignmentState(tx, {
            state,
            membershipId,
            studentIndex,
            assignmentIndex,
            classAssignment,
            assignmentModules: modulesByType.get(typeId)!,
            counts,
          });
        }
      }

      counts.students = params.studentCount;
      return counts;
    },
    { timeout: CLASS_SIMULATION_TRANSACTION_MS, maxWait: 10_000 }
  );

  return { ok: true as const, counts: summary };
  } catch (error) {
    if (error instanceof FreeClassSeatError) {
      return {
        ok: false as const,
        status: 409 as const,
        error: error.message,
      };
    }
    const message =
      error instanceof Error ? error.message : 'Could not populate this class.';
    return {
      ok: false as const,
      status: 400 as const,
      error: message,
    };
  }
}

export async function clearDevPanelClassSimulation(params: {
  userId: string;
  classId: string;
}) {
  const owned = await assertTeacherOwnsClass({
    userId: params.userId,
    classId: params.classId,
  });
  if (!owned) {
    return { ok: false as const, status: 403 as const, error: 'Class not found.' };
  }

  const removed = await prisma.$transaction(
    async (tx) => deleteSimulatedUsersForClass(tx, params.classId),
    { timeout: CLASS_SIMULATION_TRANSACTION_MS, maxWait: 10_000 }
  );

  return { ok: true as const, removedStudents: removed };
}
