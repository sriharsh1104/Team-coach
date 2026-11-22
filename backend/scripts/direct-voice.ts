/**
 * Grant / revoke / list the 1-on-1 voice permission.
 *
 * Same shape as platform-admin.ts, and available from the server for the same
 * reason — but this one is ALSO exposed through /admin (POST /admin/direct-voice)
 * because handing it out is routine, unlike platform admin.
 *
 *   npm run voice:direct:list
 *   npm run voice:direct:grant  -- someone@example.com [another@example.com ...]
 *   npm run voice:direct:revoke -- someone@example.com
 *
 * A call needs the permission on BOTH people, re-checked when the room token
 * is minted — so granting it to one person alone opens nothing, and a revoke
 * takes effect on their next join.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Action = 'grant' | 'revoke' | 'list';

function usage(): never {
  console.error(
    'Usage:\n' +
      '  npm run voice:direct:list\n' +
      '  npm run voice:direct:grant  -- <email> [email ...]\n' +
      '  npm run voice:direct:revoke -- <email> [email ...]',
  );
  process.exit(1);
}

async function list() {
  const users = await prisma.user.findMany({
    where: { canDirectVoice: true },
    orderBy: { createdAt: 'asc' },
    select: { email: true, name: true },
  });
  if (users.length === 0) {
    console.log('Nobody has 1-on-1 voice.');
    return;
  }
  console.log(`${users.length} user(s) with 1-on-1 voice:`);
  for (const u of users) console.log(`  ${u.email}  (${u.name})`);
  if (users.length === 1) {
    console.log(
      '\nOnly one — a call needs two, so nothing is reachable yet.',
    );
  }
}

async function setDirectVoice(emails: string[], canDirectVoice: boolean) {
  let missing = 0;
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, canDirectVoice: true },
    });
    if (!user) {
      console.error(`  ✗ ${email} — no such user. They must sign up first.`);
      missing += 1;
      continue;
    }
    if (user.canDirectVoice === canDirectVoice) {
      console.log(`  · ${user.email} already ${canDirectVoice ? 'has' : 'lacks'} it.`);
      continue;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { canDirectVoice },
    });
    console.log(
      `  ✓ ${canDirectVoice ? 'Granted' : 'Revoked'} 1-on-1 voice for ${user.email} (${user.name}).`,
    );
  }
  // Exit non-zero on a typo'd address rather than reporting success.
  if (missing > 0) process.exit(1);
}

async function main() {
  const [action, ...emails] = process.argv.slice(2) as [
    Action | undefined,
    ...string[],
  ];
  if (action === 'list') return list();
  if (action === 'grant' || action === 'revoke') {
    if (emails.length === 0) usage();
    return setDirectVoice(emails, action === 'grant');
  }
  usage();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
