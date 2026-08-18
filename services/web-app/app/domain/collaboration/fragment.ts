/**
 * The Y.Doc XML fragment the ProseMirror binding writes into.
 *
 * Its own module, with no imports, because things outside the web app need it.
 * The seed that builds the demo's collaborative rooms runs from the Prisma
 * package, and reaching this constant through `schema.ts` would drag TipTap and
 * every editor extension into a workspace whose job is the database — where they
 * are not installed, so the seed fails on import rather than doing anything
 * useful.
 *
 * A room written to a different field is invisible to the editor while looking
 * perfectly healthy in the database, which is why this is shared rather than
 * repeated.
 */
export const COLLAB_FRAGMENT_FIELD = 'default';
