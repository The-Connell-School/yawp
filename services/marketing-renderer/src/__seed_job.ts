import { createRequire } from 'node:module';

const requireCjs = createRequire(import.meta.url);
const { PrismaClient } = requireCjs('@app/prisma');
const { PrismaPg } = requireCjs('@prisma/adapter-pg');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const admin = await prisma.user.findFirst({
  where: { isAdmin: true },
  select: { id: true },
});
if (!admin) throw new Error('no admin user');

const job = await prisma.marketingMediaJob.create({
  data: {
    createdById: admin.id,
    kind: 'CLIP',
    status: 'QUEUED',
    brief: 'End-to-end disk-mode proof: student opens their draft.',
    subjectType: 'FEATURE',
    storyboard: {
      slug: 'open-a-document',
      title: 'Open a document',
      persona: 'student',
      viewport: 'desktop',
      scenes: [
        {
          id: 'open-draft',
          goto: '/app',
          waitFor: 'main',
          settle: 0.8,
          hold: 2,
          steps: [
            { action: 'click', role: 'link', name: 'Practice essay draft' },
            { action: 'waitFor', selector: '.ProseMirror' },
            { action: 'wait', seconds: 0.8 },
            {
              action: 'type',
              selector: '.ProseMirror',
              value: ' Proof of the whole loop.',
              at: 'end',
            },
          ],
        },
      ],
    },
    targetUrl: 'http://127.0.0.1:5173',
  },
  select: { id: true },
});
console.log(job.id);
await prisma.$disconnect();
