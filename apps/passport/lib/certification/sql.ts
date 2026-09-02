import { mkdirSync } from 'node:fs';
import path from 'node:path';

export class CertificationStorageError extends Error {
  readonly status = 503;
  readonly code = 'service_unavailable';

  constructor(message: string) {
    super(message);
  }
}

type SqlResult<T> = {
  rows: T[];
  changes: number;
};

type SqlEngine = {
  kind: 'sqlite' | 'postgres';
  execute<T>(sql: string, params?: unknown[]): Promise<SqlResult<T>>;
};

let enginePromise: Promise<SqlEngine> | null = null;

function postgresUrl(): string | null {
  for (const name of ['POSTGRES_URL', 'DATABASE_URL', 'POSTGRES_PRISMA_URL'] as const) {
    const value = process.env[name]?.trim();
    if (value?.startsWith('postgres://') || value?.startsWith('postgresql://')) {
      return value;
    }
  }
  return null;
}

function libsqlUrl(): string | null {
  return process.env.TURSO_DATABASE_URL?.trim() || process.env.LIBSQL_URL?.trim() || null;
}

function toPostgres(sql: string): string {
  return sql.replace(/\?(\d+)/g, (_match, index: string) => `$${index}`);
}

async function createEngine(): Promise<SqlEngine> {
  const postgres = postgresUrl();
  if (postgres) {
    const { neon } = await import('@neondatabase/serverless');
    const query = neon(postgres, { fullResults: true });
    return {
      kind: 'postgres',
      async execute<T>(sql: string, params: unknown[] = []): Promise<SqlResult<T>> {
        const result = (await query.query(toPostgres(sql), params)) as
          | T[]
          | { rows?: T[]; rowCount?: number | null };
        if (Array.isArray(result)) {
          return { rows: result, changes: result.length };
        }
        const rows = result.rows ?? [];
        return {
          rows,
          changes: Number(result.rowCount ?? rows.length),
        };
      },
    };
  }

  const remote = libsqlUrl();
  if (!remote && process.env.VERCEL) {
    throw new CertificationStorageError(
      'Certification needs a database. In Vercel, open Storage, create a Neon Postgres database, and redeploy.',
    );
  }

  const { createClient } = await import('@libsql/client');
  let url = remote;
  if (!url) {
    const dir = path.join(process.cwd(), '.data');
    mkdirSync(dir, { recursive: true });
    url = `file:${path.join(dir, 'passport.db').replaceAll('\\', '/')}`;
  }
  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN?.trim(),
  });
  return {
    kind: 'sqlite',
    async execute<T>(sql: string, params: unknown[] = []): Promise<SqlResult<T>> {
      const result = await client.execute({ sql, args: params as Array<string | number | bigint | null> });
      return {
        rows: result.rows as T[],
        changes: Number(result.rowsAffected || result.rows.length || 0),
      };
    },
  };
}

function engine(): Promise<SqlEngine> {
  enginePromise ??= createEngine().catch((error: unknown) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

export async function sqlExec(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  const result = await (await engine()).execute(sql, params);
  return { changes: result.changes };
}

export async function sqlFirst<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const result = await (await engine()).execute<T>(sql, params);
  return result.rows[0] ?? null;
}

export async function sqlKind(): Promise<'sqlite' | 'postgres'> {
  return (await engine()).kind;
}
