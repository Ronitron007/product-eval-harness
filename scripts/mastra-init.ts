// Runs storage.init() of PostgresStore once, in schema mastra, on the database at the URL
// in argv[2]. Only scripts/dump-mastra-schema.sh calls it, on a throwaway local Postgres.
import { PostgresStore } from '@mastra/pg'
import pg from 'pg'

const url = process.argv[2]
if (!url) throw new Error('Usage: tsx scripts/mastra-init.ts <postgres URL of a throwaway database>')
const pool = new pg.Pool({ connectionString: url })
try {
  await new PostgresStore({ id: 'harness', pool, schemaName: 'mastra', disableInit: false }).init()
} finally {
  await pool.end()
}
