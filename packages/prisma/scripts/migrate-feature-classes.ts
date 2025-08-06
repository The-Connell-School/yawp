#!/usr/bin/env bun
/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface StudentGradePeriod {
  organizationId: string;
  grade: string | null;
  period: string | null;
}

async function migrateFeatureClasses() {
  console.log('🏫 Starting FeatureClass migration...');
  console.time('⏱️ FeatureClass migration completed');

  try {
    // Get all unique grade/period combinations per organization from student profiles
    const studentProfiles = await prisma.studentProfile.findMany({
      include: {
        user: {
          select: {
            organizationId: true,
          },
        },
      },
    });

    console.log(`📊 Found ${studentProfiles.length} student profiles to process`);

    // Group by organization and create unique grade/period combinations
    const organizationClassMap = new Map<string, Set<string>>();
    const studentsNeedingUnassigned = new Set<string>();

    for (const profile of studentProfiles) {
      const orgId = profile.user.organizationId;
      
      if (!orgId) {
        console.warn(`⚠️ Student profile ${profile.id} has no organization, skipping`);
        continue;
      }

      if (!profile.grade || !profile.period) {
        // Track students with missing grade or period for unassigned class
        studentsNeedingUnassigned.add(orgId);
        console.log(`📝 Student profile ${profile.id} missing grade/period - will create unassigned class for org ${orgId}`);
        continue;
      }

      // Create unique identifier for grade/period combination
      const classKey = `${profile.grade}|${profile.period}`;
      
      if (!organizationClassMap.has(orgId)) {
        organizationClassMap.set(orgId, new Set());
      }
      
      organizationClassMap.get(orgId)?.add(classKey);
    }

    console.log(`🏢 Processing ${organizationClassMap.size} organizations`);

    let totalClassesCreated = 0;

    // Create FeatureClass records for each unique combination
    for (const [orgId, classKeys] of organizationClassMap.entries()) {
      console.log(`🏫 Processing organization ${orgId} with ${classKeys.size} unique class combinations`);

      for (const classKey of classKeys) {
        const [grade, period] = classKey.split('|');
        
        try {
          // Use upsert to handle duplicates gracefully
          await prisma.featureClass.upsert({
            where: {
              grade_period_organizationId: {
                grade,
                period,
                organizationId: orgId,
              },
            },
            update: {},
            create: {
              grade,
              period,
              organizationId: orgId,
            },
          });
          
          totalClassesCreated++;
          console.log(`✅ Created/updated class: Grade ${grade}, Period ${period} for org ${orgId}`);
        } catch (error) {
          console.error(`❌ Failed to create class for org ${orgId}, grade ${grade}, period ${period}:`, error);
        }
      }
    }

    // Create "unassigned" classes for organizations that have students with missing data
    for (const orgId of studentsNeedingUnassigned) {
      try {
        await prisma.featureClass.upsert({
          where: {
            grade_period_organizationId: {
              grade: 'unassigned',
              period: 'unassigned', 
              organizationId: orgId,
            },
          },
          update: {},
          create: {
            grade: 'unassigned',
            period: 'unassigned',
            organizationId: orgId,
          },
        });
        
        totalClassesCreated++;
        console.log(`📋 Created unassigned class for org ${orgId}`);
      } catch (error) {
        console.error(`❌ Failed to create unassigned class for org ${orgId}:`, error);
      }
    }

    console.log(`🎉 Successfully created/updated ${totalClassesCreated} FeatureClass records`);
    
    // Verify the results
    const finalCount = await prisma.featureClass.count();
    console.log(`📊 Total FeatureClass records in database: ${finalCount}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    console.timeEnd('⏱️ FeatureClass migration completed');
  }
}

// Run the migration
migrateFeatureClasses()
  .catch((e) => {
    console.error('💥 Migration script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });