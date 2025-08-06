#!/usr/bin/env bun

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Data migration script to transition from single-organization users to multi-organization UserRole structure
 * 
 * This script:
 * 1. Migrates existing user-organization relationships to UserRole records
 * 2. Moves student and teacher profiles to be linked to UserRole instead of User
 * 3. Transfers role flags (isOwner, isAdmin, isSuperOwner) from User to UserRole
 * 4. Preserves all existing data while enabling multi-organization support
 */

interface LegacyUser {
  id: string;
  organizationId: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  isSuperOwner: boolean;
  studentProfile?: {
    id: string;
    workshopLeaderId: string | null;
    school: string | null;
    schoolTeacher: string | null;
    grade: string | null;
    period: string | null;
  } | null;
  teacherProfile?: {
    id: string;
    isActive: boolean;
  } | null;
}

async function main() {
  console.log('🚀 Starting multi-organization migration...');

  // Step 1: Check if migration has already been performed
  console.log('📋 Checking migration status...');
  const existingUserRoles = await prisma.userRole.count();
  if (existingUserRoles > 0) {
    console.log(`⚠️ Found ${existingUserRoles} UserRole records. Migration may have already been performed.`);
    const shouldContinue = process.env.FORCE_MIGRATION === 'true';
    if (!shouldContinue) {
      console.log('💡 Set FORCE_MIGRATION=true to run migration anyway.');
      return;
    }
  }

  // Step 2: Get all users with their current organization and profiles
  console.log('📦 Fetching existing user data...');
  
  // Note: This will need to be adjusted once the schema is actually migrated
  // For now, we're preparing the migration logic
  const legacyUsers = await prisma.$queryRaw<LegacyUser[]>`
    SELECT 
      u.id,
      u."organizationId",
      u."isOwner",
      u."isAdmin", 
      u."isSuperOwner",
      sp.id as "studentProfileId",
      sp."workshopLeaderId",
      sp.school,
      sp."schoolTeacher",
      sp.grade,
      sp.period,
      tp.id as "teacherProfileId",
      tp."isActive" as "teacherIsActive"
    FROM "User" u
    LEFT JOIN "StudentProfile" sp ON sp."userId" = u.id
    LEFT JOIN "TeacherProfile" tp ON tp."userId" = u.id
    WHERE u."organizationId" IS NOT NULL
  `;

  console.log(`👥 Found ${legacyUsers.length} users to migrate`);

  if (legacyUsers.length === 0) {
    console.log('✅ No users with organization relationships found. Migration complete.');
    return;
  }

  // Step 3: Create UserRole records for each user-organization relationship
  console.log('🔄 Creating UserRole records...');
  
  for (const user of legacyUsers) {
    console.log(`  Migrating user ${user.id} to organization ${user.organizationId}`);
    
    try {
      // Create the UserRole record
      const userRole = await prisma.userRole.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId!,
          isOwner: user.isOwner,
          isAdmin: user.isAdmin,
          isSuperOwner: user.isSuperOwner,
        },
      });

      // Move student profile to UserRole if it exists
      if (user.studentProfile) {
        console.log(`    Moving student profile ${user.studentProfile.id}`);
        await prisma.studentProfile.update({
          where: { id: user.studentProfile.id },
          data: { userRoleId: userRole.id },
        });
      }

      // Move teacher profile to UserRole if it exists  
      if (user.teacherProfile) {
        console.log(`    Moving teacher profile ${user.teacherProfile.id}`);
        await prisma.teacherProfile.update({
          where: { id: user.teacherProfile.id },
          data: { userRoleId: userRole.id },
        });
      }

    } catch (error) {
      console.error(`❌ Error migrating user ${user.id}:`, error);
      throw error;
    }
  }

  // Step 4: Clean up the User table by removing the old fields
  // Note: This would be done by the Prisma migration, not this script
  console.log('🧹 User table cleanup will be handled by Prisma migration');

  console.log('✅ Multi-organization migration completed successfully!');
  console.log(`📊 Created ${legacyUsers.length} UserRole records`);
}

main()
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });