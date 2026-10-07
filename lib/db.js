import pg from 'pg';

// Serverless: one connection per function instance. Use a pooled connection
// string (e.g. Neon / Vercel Postgres "pooled") in DATABASE_URL.
const g = globalThis;
export const pool = (g.__aotanPool ??= new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
}));
