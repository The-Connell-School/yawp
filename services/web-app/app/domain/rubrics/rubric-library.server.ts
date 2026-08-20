import { prisma } from '~/utils/db.server';
import {
  formatRubricSchema,
  parseRubricSchema,
  type RubricSchema,
} from './rubric-schema';
import { STARTER_RUBRICS } from './starter-rubrics';

export type StoredRubric = {
  id: string;
  name: string;
  title: string;
  schema: RubricSchema;
  json: string;
};

function toStoredRubric(row: {
  id: string;
  name: string;
  title: string;
  schemaJson: unknown;
}): StoredRubric | null {
  const parsed = parseRubricSchema(row.schemaJson);
  if (!parsed.ok) return null;

  return {
    id: row.id,
    name: row.name,
    title: row.title,
    schema: parsed.schema,
    json: formatRubricSchema(parsed.schema),
  };
}

export async function listRubrics(): Promise<StoredRubric[]> {
  const rows = await prisma.rubric.findMany({ orderBy: { title: 'asc' } });
  return rows
    .map((row) => toStoredRubric(row))
    .filter((rubric): rubric is StoredRubric => rubric !== null);
}

export async function getRubric(id: string): Promise<StoredRubric | null> {
  const row = await prisma.rubric.findUnique({ where: { id } });
  return row ? toStoredRubric(row) : null;
}

/**
 * Stores a pasted rubric. A rubric already in the library under the same
 * `name` is updated rather than duplicated — that is what makes pasting the
 * same rubric into a second environment a promotion instead of a fork.
 */
export async function upsertRubric(schema: RubricSchema, title?: string) {
  const resolvedTitle = title?.trim() || schema.title || schema.name;

  return prisma.rubric.upsert({
    where: { name: schema.name },
    create: {
      name: schema.name,
      title: resolvedTitle,
      schemaJson: { ...schema, title: resolvedTitle } as object,
    },
    update: {
      title: resolvedTitle,
      schemaJson: { ...schema, title: resolvedTitle } as object,
    },
  });
}

/**
 * Puts the protected production rubrics in the library and repairs any drift.
 * These definitions are compatibility fixtures, not editable templates.
 */
export async function seedStarterRubrics() {
  const existing = await prisma.rubric.findMany({
    select: { id: true, name: true, title: true, schemaJson: true },
  });
  const byName = new Map(existing.map((row) => [row.name, row]));

  const created: string[] = [];
  for (const schema of STARTER_RUBRICS) {
    const row = byName.get(schema.name);
    if (!row) {
      await prisma.rubric.create({
        data: {
          name: schema.name,
          title: schema.title,
          schemaJson: schema as object,
        },
      });
      created.push(schema.name);
      continue;
    }

    const parsed = parseRubricSchema(row.schemaJson);
    const existingJson = parsed.ok ? formatRubricSchema(parsed.schema) : null;
    const parsedCanonical = parseRubricSchema(schema);
    const canonicalJson = parsedCanonical.ok
      ? formatRubricSchema(parsedCanonical.schema)
      : formatRubricSchema(schema);
    if (row.title !== schema.title || existingJson !== canonicalJson) {
      await prisma.rubric.update({
        where: { id: row.id },
        data: { title: schema.title, schemaJson: schema as object },
      });
    }
  }

  return created;
}
