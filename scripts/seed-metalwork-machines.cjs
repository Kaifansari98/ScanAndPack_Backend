// Local only. Usage: node scripts/seed-metalwork-machines.cjs --vendor-id 2 [--apply]
// Adds missing machines; never overwrites existing machine configuration.
require('dotenv').config({ quiet: true });
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { Client } = createRequire(require.resolve('@prisma/adapter-pg'))('pg');
const shops = [
  ['FABRICATION SHOP', 'FAB', [
    ['Laser Tube Cutting','Laser Cutting'], ['Tube Cutting','Cutting Machines'], ['CNC TUBE BENDING','Tube Bending'], ['MANUAL TUBE BENDING','Tube Bending'], ['TUBE NOTCHING','Tube Notching'], ['LASER WELDING','Laser Welding'], ['MIG Welding','MIG Welding'], ['WELDING ROBOT 1','Robotic Welding'], ['WELDING ROBOT 2','Robotic Welding'], ['GRINDING','Grinding'], ['BUFFING','Buffing'], ['Pre Treatment','Pre Treatment'], ['Powder Coating','Powder Coating'], ['Assembly','Assembly'], ['Quality Check','QC Station'], ['Cleaning','Cleaning'], ['Packing','Packaging'],
  ]],
  ['SHEET METAL SHOP', 'SHEET', [
    ['Laser Cutting','Laser Cutting'], ['Press Break 1','Press Brake'], ['Press Break 2','Press Brake'], ['Spot Welding','Spot Welding'], ['Laser Welding','Laser Welding'], ['Laser Spot Welding','Laser Spot Welding'], ['MIG Welding','MIG Welding'], ['Pre Treatment','Pre Treatment'], ['Powder Coating','Powder Coating'], ['Quality Check','QC Station'], ['Cleaning','Cleaning'], ['Packing','Packaging'],
  ]],
  ['LEATHER SHOP', 'LEATHER', [
    ['Leather Cutting','Cutting Machines'], ['Leather Stitching','Stitching'], ['Leather Pasting','Pasting'], ['Leather Assembly','Assembly'], ['Quality Check','QC Station'], ['Cleaning','Cleaning'], ['Packing','Packaging'],
  ]],
  ['STONE SHOP', 'STONE', [
    ['Stone Cutting','Cutting Machines'], ['Stone Edging','Stone Edging'], ['Stone Pasting','Pasting'], ['Stone Profile Assembly','Assembly'], ['Quality Check','QC Station'], ['Cleaning','Cleaning'], ['Packing','Packaging'],
  ]],
  ['MEMBRANE SHOP', 'MEMBRANE', [
    ['Sanding 1','Sanding'], ['Gluing','Gluing'], ['Vaccum Foiling','Vacuum Foiling'], ['Foil Cutting','Cutting Machines'], ['Quality Check','QC Station'], ['Cleaning','Cleaning'], ['Packing','Packaging'],
  ]],
  ['ACRYLIC SHOP', 'ACRYLIC', [
    ['Acrylic Cutting','Cutting Machines'], ['Acrylic Pressing','Pressing'], ['Acrylic Trimming','Trimming'], ['Acrylic Buffing','Buffing'], ['Quality Check','QC Station'], ['Cleaning','Cleaning'], ['Packing','Packaging'],
  ]],
  ['PAINT SHOP', 'PAINT', [
    ['Panel Sanding 1','Sanding'], ['Base Coat 1','Painting'], ['Panel Sanding 2','Sanding'], ['Base Coat 2','Painting'], ['Top Coat 1','Painting'], ['Top Coat 2','Painting'], ['Matte','Painting'],
  ]],
  ['ALUMINIUM SHOP', 'ALUMINIUM', [
    ['Profile Cutting','Cutting Machines'], ['Profile Routing','Router'], ['Profile Assembly','Assembly'], ['Glass Assembly','Assembly'], ['Profile Packing','Packaging'],
  ]],
];
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error('This seed only runs against a local database');
  const vendorIndex = process.argv.indexOf('--vendor-id');
  const vendorId = vendorIndex < 0 ? NaN : Number(process.argv[vendorIndex + 1]);
  if (!Number.isInteger(vendorId) || vendorId <= 0) throw Error('--vendor-id is required');
  const apply = process.argv.includes('--apply');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(20261020, $1)', [vendorId]);
    const vendor = (await db.query('SELECT id,vendor_name FROM "VendorMaster" WHERE id=$1', [vendorId])).rows[0];
    if (!vendor) throw Error('Vendor not found');
    const actor = (await db.query(`SELECT u.id FROM "UserMaster" u JOIN "UserTypeMaster" t ON t.id=u.user_type_id WHERE u.vendor_id=$1 AND lower(u.status)='active' AND t.user_type IN ('admin','super-admin') ORDER BY u.id LIMIT 1`, [vendorId])).rows[0];
    if (!actor) throw Error('No active vendor admin found');
    const column = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='MachineMaster' AND column_name='fabrication'`)).rows[0];
    const migrationName = '20261020090000_add_machine_fabrication';
    if (!column && apply) {
      const sql = readFileSync(join(__dirname, '../prisma/migrations', migrationName, 'migration.sql'), 'utf8');
      await db.query(sql);
      await db.query(`INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES ($1,$2,NOW(),$3,NOW(),1)`, [randomUUID(), createHash('sha256').update(sql).digest('hex'), migrationName]);
    }
    if (apply) {
      // Restored local dumps may have ID sequences behind their existing rows.
      await db.query('LOCK TABLE "MachineTypeMaster", "MachineMaster" IN SHARE ROW EXCLUSIVE MODE');
      for (const table of ['MachineTypeMaster', 'MachineMaster']) {
        await db.query(`SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${table}"), nextval(pg_get_serial_sequence($1, 'id'))))`, [`"${table}"`]);
      }
    }
    const summary = [];
    let sequence = 0;
    let typesCreated = 0;
    for (const [shop, prefix, stations] of shops) {
      let created = 0, existing = 0;
      for (const [name, type] of stations) {
        sequence++;
        const code = `${prefix}_${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
        const found = (await db.query('SELECT id FROM "MachineMaster" WHERE vendor_id=$1 AND machine_code=$2', [vendorId,code])).rows[0];
        if (found) { existing++; continue; }
        created++;
        if (!apply) continue;
        let typeRow = (await db.query('SELECT id FROM "MachineTypeMaster" WHERE lower(machine_type)=lower($1) ORDER BY id LIMIT 1',[type])).rows[0];
        if (!typeRow) {
          typeRow = (await db.query(`INSERT INTO "MachineTypeMaster" (machine_type,is_scanandpack,is_trackandtrace,active,created_at,updated_at) VALUES ($1,false,true,'YES',NOW(),NOW()) RETURNING id`,[type])).rows[0];
          typesCreated++;
        }
        await db.query(`INSERT INTO "MachineMaster" (machine_name,machine_code,machine_type_id,fabrication,status,scan_type,description,vendor_id,sequence_no,created_by,updated_by,created_at,updated_at) VALUES ($1,$2,$3,'METALWORK','ACTIVE','IN',$4,$5,$6,$7,$7,NOW(),NOW())`, [name,code,typeRow.id,shop,vendorId,sequence,actor.id]);
      }
      summary.push({shop,created,existing});
    }
    await db.query(apply ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({applied:apply,vendor,actorId:actor.id,migrationApplied:apply && !column,typesCreated,total:sequence,shops:summary},null,2));
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
