// Apply only the MCP migrations to the local database, preserving unrelated migrations.
require('dotenv').config({ quiet: true });
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { Client } = createRequire(require.resolve('@prisma/adapter-pg'))('pg');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('This script only runs against a local database');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(20261022, 120000)');
    for (const migration of [
      '20261022120000_add_vendor_machine_cost_descriptions',
      '20261022130000_scope_machine_cost_descriptions_to_workstation',
      '20261022140000_add_machine_cost_amount',
    ]) {
      const applied = await db.query('SELECT id FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL', [migration]);
      if (!applied.rowCount) {
        const sql = readFileSync(join(__dirname, '../prisma/migrations', migration, 'migration.sql'), 'utf8');
        await db.query(sql);
        await db.query('INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES ($1,$2,NOW(),$3,NOW(),1)', [randomUUID(), createHash('sha256').update(sql).digest('hex'), migration]);
      }
    }
    const coverage = await db.query('SELECT m.vendor_id, m.id AS machine_id, COUNT(d.id)::int AS descriptions FROM "MachineMaster" m LEFT JOIN "MachineCostDescription" d ON d.vendor_id=m.vendor_id AND d.machine_id=m.id GROUP BY m.vendor_id, m.id ORDER BY m.vendor_id, m.id');
    if (coverage.rows.some(row => row.descriptions < 10)) throw Error('A workstation is missing cost descriptions');
    await db.query('COMMIT');
    console.log(JSON.stringify({ vendors: new Set(coverage.rows.map(row => row.vendor_id)).size, workstations: coverage.rows.length, descriptions: coverage.rows.reduce((sum, row) => sum + row.descriptions, 0) }, null, 2));
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
