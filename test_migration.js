const { Client } = require('pg');
const fs = require('fs');
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres:root@localhost:5432/postgres' });
  await client.connect();
  await client.query('DROP DATABASE IF EXISTS test_shadow');
  await client.query('CREATE DATABASE test_shadow');
  await client.end();
  
  const shadow = new Client({ connectionString: 'postgresql://postgres:root@localhost:5432/test_shadow' });
  await shadow.connect();
  const sql = fs.readFileSync('prisma/migrations/20260720000000_create_missing_tables/migration.sql', 'utf8');
  try {
    await shadow.query(sql);
    console.log("Migration executed successfully!");
  } catch (e) {
    console.error("Migration failed:", e);
  }
  const res = await shadow.query(`SELECT tablename FROM pg_tables WHERE schemaname='public';`);
  console.log("Tables created:", res.rows.map(r => r.tablename).join(', '));
  await shadow.end();
}
run();
