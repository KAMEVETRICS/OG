import { neon } from '@neondatabase/serverless';

import { CertificationStorageError } from './errors';

type SqlResult<T> = {
  rows: T[];
  changes: number;
};

function databaseUrl(): string {
  for (const name of ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_PRISMA_URL'] as const) {
    const value = process.env[name]?.trim();
    if (value?.startsWith('postgres://') || value?.startsWith('postgresql://')) {
      return value;
    }
  }
  throw new CertificationStorageError(
    'Certification needs DATABASE_URL. In Vercel, open Storage, create Neon, and redeploy.',
  );
}

let query:
  | ReturnType<typeof neon<false, true>>
  | null = null;

function client(): ReturnType<typeof neon<false, true>> {
  query ??= neon(databaseUrl(), { fullResults: true });
  return query;
}

async function execute<T>(sql: string, params: unknown[] = []): Promise<SqlResult<T>> {
  const result = (await client().query(sql, params)) as
    | T[]
    | { rows?: T[]; rowCount?: number | null };
  if (Array.isArray(result)) {
    return { rows: result, changes: result.length };
  }
  const rows = result.rows ?? [];
  return { rows, changes: Number(result.rowCount ?? rows.length) };
}

export async function sqlExec(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  const result = await execute(sql, params);
  return { changes: result.changes };
}

export async function sqlFirst<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const result = await execute<T>(sql, params);
  return result.rows[0] ?? null;
}
