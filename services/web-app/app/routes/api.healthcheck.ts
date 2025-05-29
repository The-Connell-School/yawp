// import { prisma } from '~/utils/db.server.ts';

export async function loader() {
  try {
    // await prisma.user.count()
    return new Response('OK');
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.log('healthcheck ❌', { error });
    return new Response('ERROR', { status: 500 });
  }
}
