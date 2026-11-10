import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { db } from '@/services/db/database';

afterEach(async () => {
  db.close();
  await db.delete();
});
