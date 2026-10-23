import { eq } from 'drizzle-orm';
import { getDatabase } from '../server/db/index.ts';
import { users } from '../server/db/schema.ts';

export async function getTestActors() {
  const db = getDatabase();
  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'admin@reserveflow.local'))
    .limit(1);

  const [operator] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'operator@reserveflow.local'))
    .limit(1);

  if (!admin || !operator) {
    throw new Error('Test actors not found. Did you run seedDatabase()?');
  }

  return {
    adminActor: {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    },
    operatorActor: {
      id: operator.id,
      email: operator.email,
      role: operator.role,
    },
  };
}
