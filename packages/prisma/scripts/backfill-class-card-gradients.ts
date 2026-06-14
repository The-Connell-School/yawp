import { PrismaClient } from '../generated/prisma';

const CLASS_CARD_GRADIENT_KEYS = [
  'indigo-purple-pink',
  'cyan-blue-indigo',
  'amber-orange-rose',
  'emerald-teal-cyan',
  'violet-fuchsia-amber',
  'rose-red-orange',
] as const;

function generateClassCardGradientKey(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash =
      (hash + seed.charCodeAt(i) * (i + 1)) % CLASS_CARD_GRADIENT_KEYS.length;
  }
  return CLASS_CARD_GRADIENT_KEYS[hash];
}

const prisma = new PrismaClient();

const classes = await prisma.class.findMany({
  select: { id: true, cardGradientKey: true },
});

let updated = 0;

for (const klass of classes) {
  const nextKey = generateClassCardGradientKey(klass.id);
  if (klass.cardGradientKey === nextKey) continue;

  await prisma.class.update({
    where: { id: klass.id },
    data: { cardGradientKey: nextKey },
  });
  updated += 1;
}

console.log(`Backfilled ${updated} class gradient(s).`);
await prisma.$disconnect();
