/**
 * Grant / revoke / list platform admin.
 *
 * Deliberately a script and not an API. Platform admin is the one role that
 * can see across every org, so the only way to hand it out is to already have
 * access to the server and the database — there is no endpoint to find, no
 * request body to tamper with, and no "first user becomes admin" bootstrap
 * that a stranger could race for.
 *
 *   npm run admin:list
 *   npm run admin:grant -- someone@example.com
 *   npm run admin:revoke -- someone@example.com
 *
 * Revoking takes effect on the admin's very next request: JwtStrategy reads
 * the flag from the database each time, so there is no token left to expire.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Action = 'grant' | 'revoke' | 'list';

function usage(): never {
  console.error(
    'Usage:\n' +
      '  npm run admin:list\n' +
      '  npm run admin:grant  -- <email>\n' +
      '  npm run admin:revoke -- <email>',
  );
  process.exit(1);
}

async function list() {
  const admins = await prisma.user.findMany({
    where: { isPlatformAdmin: true },
    orderBy: { createdAt: 'asc' },
    select: { email: true, name: true, createdAt: true },
  });
  if (admins.length === 0) {
    console.log('No platform admins.');
    return;
  }
  console.log(`${admins.length} platform admin(s):`);
  for (const a of admins) {
    console.log(`  ${a.email}  (${a.name})`);
  }
}

async function setAdmin(email: string, isPlatformAdmin: boolean) {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, name: true, email: true, isPlatformAdmin: true },
  });
  if (!user) {
    console.error(`No user with email ${normalized}. They must sign up first.`);
    process.exit(1);
  }
  if (user.isPlatformAdmin === isPlatformAdmin) {
    console.log(
      `${user.email} is already ${isPlatformAdmin ? 'an admin' : 'not an admin'}. Nothing to do.`,
    );
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { isPlatformAdmin },
  });
  console.log(
    `${isPlatformAdmin ? 'Granted' : 'Revoked'} platform admin for ${user.email} (${user.name}).`,
  );
}

async function main() {
  const [action, email] = process.argv.slice(2) as [Action | undefined, string?];
  if (action === 'list') return list();
  if (action === 'grant' || action === 'revoke') {
    if (!email) usage();
    return setAdmin(email, action === 'grant');
  }
  usage();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
