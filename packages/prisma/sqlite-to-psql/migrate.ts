import { PrismaClient } from '@prisma/client';
import { Database } from 'bun:sqlite';
import { Prisma } from '@prisma/client';

const sqliteDb = new Database(__dirname + '/test.db');
const psqlPrisma = new PrismaClient();

async function migrateData() {
  try {
    console.log('Starting data migration...');
    const sanityCheck = sqliteDb
      .prepare('SELECT name FROM sqlite_master WHERE type="table"')
      .all();
    if (sanityCheck.length === 0) {
      throw new Error(
        'Sanity check failed: No tables found in the SQLite database.'
      );
    }
    console.log(
      `Sanity check passed: Found ${sanityCheck.length} tables in the SQLite database.`
    );

    // Users
    console.log('Starting Users migration...');
    const users = sqliteDb.prepare('SELECT * FROM "User"').all() as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      email: string;
      name: string | null;
    }>;

    console.log(`Found ${users.length} Users to migrate`);
    await psqlPrisma.user.createMany({
      data: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
      })),
    });
    console.log('Finished Users migration');

    // Passwords
    console.log('Starting Passwords migration...');
    const passwords = sqliteDb
      .prepare('SELECT * FROM "Password"')
      .all() as Array<{
      hash: string;
      userId: string;
    }>;

    console.log(`Found ${passwords.length} Passwords to migrate`);
    await psqlPrisma.password.createMany({
      data: passwords.map((password) => ({
        hash: password.hash,
        userId: password.userId,
      })),
    });
    console.log('Finished Passwords migration');

    // Permissions
    console.log('Starting Permissions migration...');
    const permissions = sqliteDb
      .prepare('SELECT * FROM "Permission"')
      .all() as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      action: string;
      entity: string;
      access: string;
      description: string;
    }>;

    console.log(`Found ${permissions.length} Permissions to migrate`);
    await psqlPrisma.permission.createMany({
      data: permissions.map((permission) => ({
        id: permission.id,
        action: permission.action,
        entity: permission.entity,
        access: permission.access,
        description: permission.description,
        createdAt: new Date(permission.createdAt),
        updatedAt: new Date(permission.updatedAt),
      })),
    });
    console.log('Finished Permissions migration');

    // Roles
    console.log('Starting Roles migration...');
    const roles = sqliteDb.prepare('SELECT * FROM "Role"').all() as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      name: string;
      description: string;
    }>;

    console.log(`Found ${roles.length} Roles to migrate`);
    await psqlPrisma.role.createMany({
      data: roles.map((role) => ({
        id: role.id,
        name: role.name,
        description: role.description,
        createdAt: new Date(role.createdAt),
        updatedAt: new Date(role.updatedAt),
      })),
    });
    console.log('Finished Roles migration');

    // RoleToUser
    console.log('Starting RoleToUser migration...');
    const roleToUsers = sqliteDb
      .prepare('SELECT * FROM "_RoleToUser"')
      .all() as Array<{
      A: string;
      B: string;
    }>;

    console.log(`Found ${roleToUsers.length} RoleToUser mappings to migrate`);
    await psqlPrisma.$executeRaw`
      INSERT INTO "_RoleToUser" ("A", "B")
      VALUES ${Prisma.join(
        roleToUsers.map(
          (roleToUser) => Prisma.sql`(${roleToUser.A}, ${roleToUser.B})`
        )
      )}
    `;
    console.log('Finished RoleToUser migration');

    // Verifications
    console.log('Starting Verifications migration...');
    const verifications = sqliteDb
      .prepare('SELECT * FROM "Verification"')
      .all() as Array<{
      id: string;
      createdAt: number;
      type: string;
      target: string;
      secret: string;
      algorithm: string;
      digits: number;
      period: number;
      charSet: string;
      expiresAt: number | null;
      metadata: string | null;
    }>;

    console.log(`Found ${verifications.length} Verifications to migrate`);
    await psqlPrisma.verification.createMany({
      data: verifications.map((verification) => ({
        id: verification.id,
        type: verification.type,
        target: verification.target,
        secret: verification.secret,
        algorithm: verification.algorithm,
        digits: verification.digits,
        period: verification.period,
        charSet: verification.charSet,
        expiresAt: verification.expiresAt
          ? new Date(verification.expiresAt)
          : null,
        metadata: verification.metadata,
        createdAt: new Date(verification.createdAt),
      })),
    });
    console.log('Finished Verifications migration');

    // TeacherProfiles
    console.log('Starting TeacherProfiles migration...');
    const teacherProfiles = sqliteDb
      .prepare('SELECT * FROM "TeacherProfile"')
      .all() as Array<{
      id: string;
      createdAt: number;
      userId: string;
      isActive: number;
    }>;

    console.log(`Found ${teacherProfiles.length} TeacherProfiles to migrate`);
    await psqlPrisma.teacherProfile.createMany({
      data: teacherProfiles.map((teacherProfile) => ({
        id: teacherProfile.id,
        userId: teacherProfile.userId,
        isActive: teacherProfile.isActive === 1,
        createdAt: new Date(teacherProfile.createdAt),
      })),
    });
    console.log('Finished TeacherProfiles migration');

    // Courses
    console.log('Starting Courses migration...');
    const courses = sqliteDb.prepare('SELECT * FROM "Course"').all() as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      title: string;
      description: string | null;
      position: number;
    }>;

    console.log(`Found ${courses.length} Courses to migrate`);
    await psqlPrisma.course.createMany({
      data: courses.map((course) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        position: course.position,
        createdAt: new Date(course.createdAt),
        updatedAt: new Date(course.updatedAt),
      })),
    });
    console.log('Finished Courses migration');

    // FeatureFlags
    console.log('Starting FeatureFlags migration...');
    const featureFlags = sqliteDb
      .prepare('SELECT * FROM "FeatureFlag"')
      .all() as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      name: string;
      description: string | null;
      isEnabled: number;
    }>;

    console.log(`Found ${featureFlags.length} FeatureFlags to migrate`);
    await psqlPrisma.featureFlag.createMany({
      data: featureFlags.map((featureFlag) => ({
        id: featureFlag.id,
        name: featureFlag.name,
        description: featureFlag.description,
        isEnabled: featureFlag.isEnabled === 1,
        createdAt: new Date(featureFlag.createdAt),
        updatedAt: new Date(featureFlag.updatedAt),
      })),
    });
    console.log('Finished FeatureFlags migration');

    // Settings
    console.log('Starting Settings migration...');
    const settings = sqliteDb
      .prepare('SELECT * FROM "Setting"')
      .all() as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      name: string;
      value: string;
      valueType: string;
    }>;

    console.log(`Found ${settings.length} Settings to migrate`);
    await psqlPrisma.setting.createMany({
      data: settings.map((setting) => ({
        id: setting.id,
        name: setting.name,
        value: setting.value,
        valueType: setting.valueType,
        createdAt: new Date(setting.createdAt),
        updatedAt: new Date(setting.updatedAt),
      })),
    });
    console.log('Finished Settings migration');

    // StudentViews
    console.log('Starting StudentViews migration...');
    const studentViews = sqliteDb
      .prepare('SELECT * FROM "StudentView"')
      .all() as Array<{
      id: string;
      name: string;
      school: string | null;
      grade: string | null;
      period: string | null;
      workshopLeader: string | null;
      schoolTeacher: string | null;
      userId: string;
      createdAt: number;
      updatedAt: number;
    }>;

    console.log(`Found ${studentViews.length} StudentViews to migrate`);
    await psqlPrisma.studentView.createMany({
      data: studentViews.map((studentView) => ({
        id: studentView.id,
        name: studentView.name,
        school: studentView.school,
        grade: studentView.grade,
        period: studentView.period,
        workshopLeader: studentView.workshopLeader,
        schoolTeacher: studentView.schoolTeacher,
        userId: studentView.userId,
        createdAt: new Date(studentView.createdAt),
        updatedAt: new Date(studentView.updatedAt),
      })),
    });
    console.log('Finished StudentViews migration');

    // UserImages
    console.log('Starting UserImages migration...');
    const images = sqliteDb.prepare('SELECT * FROM "UserImage"').all() as {
      id: string;
      contentType: string;
      blob: Uint8Array;
      userId: string;
    }[];

    console.log(`Found ${images.length} UserImages to migrate`);
    await psqlPrisma.userImage.createMany({
      data: images.map((image) => ({
        id: image.id,
        contentType: image.contentType,
        blob: image.blob,
        userId: image.userId,
      })),
    });
    console.log('Finished UserImages migration');

    // StudentProfiles
    console.log('Starting StudentProfiles migration...');
    const studentProfiles = sqliteDb
      .prepare('SELECT * FROM "StudentProfile"')
      .all() as {
      id: string;
      createdAt: number;
      userId: string;
      workshopLeaderId: string;
      school: string;
      schoolTeacher: string;
      grade: string;
      period: string;
    }[];

    console.log(`Found ${studentProfiles.length} StudentProfiles to migrate`);
    await psqlPrisma.studentProfile.createMany({
      data: studentProfiles.map((studentProfile) => ({
        id: studentProfile.id,
        userId: studentProfile.userId,
        workshopLeaderId: studentProfile.workshopLeaderId,
        school: studentProfile.school,
        schoolTeacher: studentProfile.schoolTeacher,
        grade: studentProfile.grade,
        period: studentProfile.period,
      })),
    });
    console.log('Finished StudentProfiles migration');

    // CourseImages
    console.log('Starting CourseImages migration...');
    const courseImages = sqliteDb
      .prepare('SELECT * FROM "CourseImage"')
      .all() as {
      id: string;
      contentType: string;
      blob: Uint8Array;
      courseId: string;
    }[];

    console.log(`Found ${courseImages.length} CourseImages to migrate`);
    await psqlPrisma.courseImage.createMany({
      data: courseImages.map((courseImage) => ({
        id: courseImage.id,
        contentType: courseImage.contentType,
        blob: courseImage.blob,
        courseId: courseImage.courseId,
      })),
    });
    console.log('Finished CourseImages migration');

    // CourseModules
    console.log('Starting CourseModules migration...');
    const courseModules = sqliteDb
      .prepare('SELECT * FROM "CourseModule"')
      .all() as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      deletedAt: number | null;
      title: string;
      position: number;
      description: string;
      tutorInstructions: string;
      isSelfGuided: number;
      courseId: string;
    }>;

    console.log(`Found ${courseModules.length} CourseModules to migrate`);
    await psqlPrisma.courseModule.createMany({
      data: courseModules.map((courseModule) => ({
        id: courseModule.id,
        courseId: courseModule.courseId,
        title: courseModule.title,
        description: courseModule.description,
        tutorInstructions: courseModule.tutorInstructions,
        isSelfGuided: courseModule.isSelfGuided === 1,
        position: courseModule.position,
        createdAt: new Date(courseModule.createdAt),
        updatedAt: new Date(courseModule.updatedAt),
        deletedAt: courseModule.deletedAt
          ? new Date(courseModule.deletedAt)
          : null,
      })),
    });
    console.log('Finished CourseModules migration');

    // Documents
    console.log('Starting Documents migration...');
    const documents = sqliteDb
      .prepare('SELECT * FROM "Document"')
      .all() as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      deletedAt: number | null;
      title: string;
      text: string;
      html: string;
      userId: string;
    }>;

    console.log(`Found ${documents.length} Documents to migrate`);
    await psqlPrisma.document.createMany({
      data: documents.map((document) => ({
        id: document.id,
        title: document.title,
        text: document.text,
        html: document.html,
        userId: document.userId,
        deletedAt: document.deletedAt ? new Date(document.deletedAt) : null,
        createdAt: new Date(document.createdAt),
        updatedAt: new Date(document.updatedAt),
      })),
    });
    console.log('Finished Documents migration');

    // CourseModuleSessions
    console.log('Starting CourseModuleSessions migration...');
    const courseModuleSessions = sqliteDb
      .prepare('SELECT * FROM "CourseModuleSession"')
      .all() as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      deletedAt: number | null;
      title: string;
      instructionsCompleted: number;
      courseModuleId: string;
      userId: string;
      documentId: string;
    }>;

    console.log(
      `Found ${courseModuleSessions.length} CourseModuleSessions to migrate`
    );
    await psqlPrisma.courseModuleSession.createMany({
      data: courseModuleSessions.map((courseModuleSession) => ({
        id: courseModuleSession.id,
        title: courseModuleSession.title,
        deletedAt: courseModuleSession.deletedAt
          ? new Date(courseModuleSession.deletedAt)
          : null,
        instructionsCompleted: courseModuleSession.instructionsCompleted,
        courseModuleId: courseModuleSession.courseModuleId,
        documentId: courseModuleSession.documentId,
        userId: courseModuleSession.userId,
      })),
    });
    console.log('Finished CourseModuleSessions migration');

    // CourseModuleSessionMessages
    console.log('Starting CourseModuleSessionMessages migration...');
    const courseModuleSessionMessages = sqliteDb
      .prepare('SELECT * FROM "CourseModuleSessionMessage"')
      .all() as Array<{
      id: string;
      createdAt: number;
      courseModuleSessionId: string;
      instructionId: string;
      content: string;
      agent: string;
      factCheckPrompt: string | null;
      context: string | null;
    }>;

    console.log(
      `Found ${courseModuleSessionMessages.length} CourseModuleSessionMessages to migrate`
    );
    await psqlPrisma.courseModuleSessionMessage.createMany({
      data: courseModuleSessionMessages.map((courseModuleSessionMessage) => ({
        id: courseModuleSessionMessage.id,
        courseModuleSessionId: courseModuleSessionMessage.courseModuleSessionId,
        instructionId: courseModuleSessionMessage.instructionId,
        content: courseModuleSessionMessage.content,
        agent: courseModuleSessionMessage.agent,
        factCheckPrompt: courseModuleSessionMessage.factCheckPrompt,
        context: courseModuleSessionMessage.context,
        createdAt: new Date(courseModuleSessionMessage.createdAt),
      })),
    });
    console.log('Finished CourseModuleSessionMessages migration');

    // DocumentComments
    console.log('Starting DocumentComments migration...');
    const documentComments = sqliteDb
      .prepare('SELECT * FROM "DocumentComment"')
      .all() as Array<{
      id: string;
      createdAt: number;
      userId: string;
      content: string;
      highlightId: string | null;
      documentId: string;
    }>;

    console.log(`Found ${documentComments.length} DocumentComments to migrate`);
    await psqlPrisma.documentComment.createMany({
      data: documentComments.map((documentComment) => ({
        id: documentComment.id,
        content: documentComment.content,
        highlightId: documentComment.highlightId,
        documentId: documentComment.documentId,
        userId: documentComment.userId,
        createdAt: new Date(documentComment.createdAt),
      })),
    });
    console.log('Finished DocumentComments migration');

    // DocumentCommentResponses
    console.log('Starting DocumentCommentResponses migration...');
    const documentCommentResponses = sqliteDb
      .prepare('SELECT * FROM "DocumentCommentResponse"')
      .all() as Array<{
      id: string;
      createdAt: number;
      commentId: string;
      userId: string;
      content: string;
    }>;

    console.log(
      `Found ${documentCommentResponses.length} DocumentCommentResponses to migrate`
    );
    await psqlPrisma.documentCommentResponse.createMany({
      data: documentCommentResponses.map((response) => ({
        id: response.id,
        content: response.content,
        commentId: response.commentId,
        userId: response.userId,
        createdAt: new Date(response.createdAt),
      })),
    });
    console.log('Finished DocumentCommentResponses migration');

    // DocumentVersions
    console.log('Starting DocumentVersions migration...');
    const documentVersions = sqliteDb
      .prepare('SELECT * FROM "DocumentVersion"')
      .all() as Array<{
      id: string;
      createdAt: number;
      documentId: string;
      text: string;
      html: string;
    }>;

    console.log(`Found ${documentVersions.length} DocumentVersions to migrate`);
    await psqlPrisma.documentVersion.createMany({
      data: documentVersions.map((version) => ({
        id: version.id,
        text: version.text,
        html: version.html,
        documentId: version.documentId,
        createdAt: new Date(version.createdAt),
      })),
    });
    console.log('Finished DocumentVersions migration');

    // CourseModuleInstructions
    console.log('Starting CourseModuleInstructions migration...');
    const courseModuleInstructions = sqliteDb
      .prepare('SELECT * FROM "CourseModuleInstruction"')
      .all() as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      courseModuleId: string;
      position: number;
      title: string;
      interactiveType: string;
      prompt: string;
      tutorInstructions: string | null;
      answerType: string | null;
      answerKey: string | null;
      answerTypeOptions: string | null;
      canAskQuestion: number;
      nextInstructionBtnLabel: string | null;
    }>;

    console.log(
      `Found ${courseModuleInstructions.length} CourseModuleInstructions to migrate`
    );
    await psqlPrisma.courseModuleInstruction.createMany({
      data: courseModuleInstructions.map((instruction) => ({
        id: instruction.id,
        title: instruction.title,
        interactiveType: instruction.interactiveType,
        prompt: instruction.prompt,
        tutorInstructions: instruction.tutorInstructions,
        answerType: instruction.answerType,
        answerKey: instruction.answerKey,
        answerTypeOptions: instruction.answerTypeOptions,
        canAskQuestion: instruction.canAskQuestion === 1,
        nextInstructionBtnLabel: instruction.nextInstructionBtnLabel,
        position: instruction.position,
        courseModuleId: instruction.courseModuleId,
        createdAt: new Date(instruction.createdAt),
        updatedAt: new Date(instruction.updatedAt),
      })),
    });
    console.log('Finished CourseModuleInstructions migration');

    // InstructionAudio
    console.log('Starting InstructionAudio migration...');
    const instructionAudio = sqliteDb
      .prepare('SELECT * FROM "InstructionAudio"')
      .all() as Array<{
      id: string;
      createdAt: number;
      updatedAt: number;
      blob: Uint8Array;
      courseModuleInstructionId: string;
    }>;

    console.log(
      `Found ${instructionAudio.length} InstructionAudio records to migrate`
    );
    await psqlPrisma.instructionAudio.createMany({
      data: instructionAudio.map((audio) => ({
        id: audio.id,
        blob: audio.blob,
        courseModuleInstructionId: audio.courseModuleInstructionId,
        createdAt: new Date(audio.createdAt),
        updatedAt: new Date(audio.updatedAt),
      })),
    });
    console.log('Finished InstructionAudio migration');

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    console.log('Closing database connections...');
    sqliteDb.close();
    await psqlPrisma.$disconnect();
  }
}

// Run the migration
migrateData().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
