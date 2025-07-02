/**
 * Migration script to move existing students from workshopLeaderId to teacherClass system
 * 
 * This script should be run after the database schema has been updated to include the TeacherClass model.
 * It will:
 * 1. Find all teacher profiles
 * 2. Create a default class for each teacher who has students
 * 3. Assign existing students to their teacher's default class
 */

const { PrismaClient } = require('@app/prisma');

async function migrateStudentsToClasses() {
  const prisma = new PrismaClient();

  try {
    console.log('Starting migration of students to class system...');

    // Get all teacher profiles that have students
    const teacherProfiles = await prisma.teacherProfile.findMany({
      include: {
        user: {
          include: {
            studentProfiles: true, // Students assigned to this teacher via workshopLeaderId
          },
        },
      },
    });

    console.log(`Found ${teacherProfiles.length} teacher profiles`);

    for (const teacherProfile of teacherProfiles) {
      const studentsCount = teacherProfile.user.studentProfiles.length;
      
      if (studentsCount === 0) {
        console.log(`Teacher ${teacherProfile.user.name} has no students, skipping...`);
        continue;
      }

      console.log(`Processing teacher ${teacherProfile.user.name} with ${studentsCount} students`);

      // Create a default class for this teacher
      const defaultClass = await prisma.teacherClass.create({
        data: {
          name: `${teacherProfile.user.name}'s Class`,
          description: 'Default class created during migration from workshop leader system',
          teacherProfileId: teacherProfile.id,
        },
      });

      console.log(`Created default class "${defaultClass.name}" for teacher ${teacherProfile.user.name}`);

      // Update all students assigned to this teacher to use the new class
      const updateResult = await prisma.studentProfile.updateMany({
        where: {
          workshopLeaderId: teacherProfile.user.id,
        },
        data: {
          teacherClassId: defaultClass.id,
        },
      });

      console.log(`Updated ${updateResult.count} students to use the new class system`);
    }

    // Find students without a workshopLeaderId (orphaned students)
    const orphanedStudents = await prisma.studentProfile.findMany({
      where: {
        workshopLeaderId: null,
        teacherClassId: null,
      },
      include: {
        user: true,
      },
    });

    if (orphanedStudents.length > 0) {
      console.log(`Warning: Found ${orphanedStudents.length} orphaned students without a teacher assignment:`);
      orphanedStudents.forEach(student => {
        console.log(`  - ${student.user.name} (${student.user.email})`);
      });
      console.log('These students will need to be manually assigned to classes.');
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  migrateStudentsToClasses()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateStudentsToClasses };