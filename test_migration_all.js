const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
async function run() {
  const client = new Client({ connectionString: 'postgresql://postgres:root@localhost:5432/postgres' });
  await client.connect();
  await client.query('DROP DATABASE IF EXISTS test_shadow');
  await client.query('CREATE DATABASE test_shadow');
  await client.end();
  
  const shadow = new Client({ connectionString: 'postgresql://postgres:root@localhost:5432/test_shadow' });
  await shadow.connect();
  const dirs = fs.readdirSync('prisma/migrations').filter(d => fs.statSync(path.join('prisma/migrations', d)).isDirectory() && /^\d|^0/.test(d)).sort();
  for (const dir of dirs) {
    if (dir > '20260721000000_add_item_code_id_to_lead_specifications') break;
    const sqlPath = path.join('prisma/migrations', dir, 'migration.sql');
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf8');
      try {
        await shadow.query(sql);
        console.log(`Executed ${dir}`);
      } catch (e) {
        console.error(`Error in ${dir}:`, e.message);
        break; // Stop execution on first error, like Prisma does
      }
    }
  }
  await shadow.end();
}
run();
