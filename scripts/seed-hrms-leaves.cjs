// Local sample data only. Preview: node scripts/seed-hrms-leaves.cjs --vendor-id 1
// Apply: node scripts/seed-hrms-leaves.cjs --vendor-id 1 --date 2026-11-05 --apply
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { Client } = createRequire(require.resolve('@prisma/adapter-pg'))('pg');
const arg = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const role = value => value.trim().toLowerCase().replace(/[ _]+/g, '-');
const shiftDate = (date, days) => { const result = new Date(`${date}T12:00:00Z`); result.setUTCDate(result.getUTCDate() + days); return result.toISOString().slice(0, 10); };
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/scanandpack') throw Error('This seed only runs against the local scanandpack database.');
  const vendorId = Number(arg('--vendor-id'));
  if (!Number.isSafeInteger(vendorId) || vendorId <= 0) throw Error('--vendor-id is required.');
  const apply = process.argv.includes('--apply');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  let committed = false;
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout = '10s'");
    const vendor = (await db.query('SELECT id,vendor_name,time_zone,is_hrms_master_enabled FROM "VendorMaster" WHERE id=$1 FOR UPDATE', [vendorId])).rows[0];
    if (!vendor?.is_hrms_master_enabled) throw Error('Vendor not found or HRMS is disabled.');
    const today = arg('--date') || new Intl.DateTimeFormat('en-CA', { timeZone: vendor.time_zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (!validDate(today)) throw Error('--date must use a valid YYYY-MM-DD date.');
    const year = Number(today.slice(0, 4));
    if (year < 2000 || year > 2100) throw Error('Choose a year between 2000 and 2100.');
    const marker = `[HRMS_SAMPLE_DATA:v1:${year}]`;
    const users = (await db.query('SELECT u.id,u.user_name,u.franchise_id,t.user_type FROM "UserMaster" u JOIN "UserTypeMaster" t ON t.id=u.user_type_id WHERE u.vendor_id=$1 AND u.status=\'active\' ORDER BY u.id FOR UPDATE OF u', [vendorId])).rows;
    const admins = users.filter(user => role(user.user_type) === 'super-admin');
    if (!admins.length) throw Error('An existing active super admin is required. No accounts or permissions will be created.');
    const actor = admins[0];
    const franchises = (await db.query('SELECT id,franchise_name FROM "FranchiseMaster" WHERE vendor_id=$1 ORDER BY id', [vendorId])).rows;
    const franchiseIds = new Set(franchises.map(item => item.id));
    const eligible = users.filter(user => !user.franchise_id || franchiseIds.has(user.franchise_id));
    const tables = ['LeaveHoliday', 'LeaveWeeklyOff', 'LeaveRequest'];
    if (apply) await db.query('LOCK TABLE "LeaveHoliday", "LeaveWeeklyOff", "LeaveRequest" IN SHARE ROW EXCLUSIVE MODE');
    const original = new Map();
    for (const table of tables) {
      original.set(table, (await db.query(`SELECT to_jsonb(r) AS row FROM "${table}" r WHERE vendor_id=$1 ORDER BY id`, [vendorId])).rows.map(item => item.row));
      if (apply) {
        // A restored local dump can contain rows beyond its sequence's next value.
        const sequence = (await db.query('SELECT pg_get_serial_sequence($1,\'id\') AS name', [`"${table}"`])).rows[0].name;
        const state = (await db.query(`SELECT last_value::text,is_called FROM ${sequence}`)).rows[0];
        const maxId = Number((await db.query(`SELECT COALESCE(MAX(id),0)::text AS id FROM "${table}"`)).rows[0].id);
        if (maxId > Number(state.last_value) || (maxId === Number(state.last_value) && !state.is_called)) await db.query('SELECT setval($1::regclass,$2,true)', [sequence, maxId]);
      }
    }
    const summary = { mode: apply ? 'apply' : 'preview', vendor_id: vendorId, vendor: vendor.vendor_name, year, holidays_added: 0, weekly_policies_added: 0, requests_added: 0, existing_samples_skipped: 0, overlapping_requests_skipped: 0, statuses: { PENDING: 0, APPROVED: 0, REJECTED: 0 }, users: [] };
    const holidayPlans = [
      { date: `${year}-01-26`, name: '[Sample] Republic Day' },
      { date: `${year}-08-15`, name: '[Sample] Independence Day' },
      { date: `${year}-10-02`, name: '[Sample] Gandhi Jayanti' },
      { date: `${year}-12-25`, name: '[Sample] Christmas' },
      { date: shiftDate(today, 7), name: '[Sample] Employee wellness day' },
      { date: shiftDate(today, 14), name: '[Sample] Annual company holiday' },
      ...franchises.map((franchise, index) => ({ date: shiftDate(today, 20 + index), name: '[Sample] Local holiday', franchise_id: franchise.id })),
    ];
    const holidayKeys = new Set(original.get('LeaveHoliday').map(row => `${row.scope_key}:${row.holiday_date}`));
    for (const holiday of holidayPlans) {
      if (!holiday.date.startsWith(String(year))) continue;
      const scope = holiday.franchise_id ? String(holiday.franchise_id) : 'company', key = `${scope}:${holiday.date}`;
      if (holidayKeys.has(key)) continue;
      holidayKeys.add(key); summary.holidays_added++;
      if (apply) await db.query('INSERT INTO "LeaveHoliday" (vendor_id,franchise_id,scope_key,holiday_date,name,remark,created_by,updated_by,updated_at) VALUES ($1,$2,$3,$4::date,$5,$6,$7,$7,now())', [vendorId, holiday.franchise_id || null, scope, holiday.date, holiday.name, `${marker}`, actor.id]);
    }
    const existingPolicyScopes = new Set(original.get('LeaveWeeklyOff').map(row => row.scope_key));
    const policyPlans = [{ scope: 'company', franchise_id: null, days: [0, 6] }, ...franchises.map((franchise, index) => ({ scope: String(franchise.id), franchise_id: franchise.id, days: index % 2 ? [0] : [0, 6] }))];
    for (const policy of policyPlans) {
      if (existingPolicyScopes.has(policy.scope)) continue;
      summary.weekly_policies_added++;
      if (apply) await db.query('INSERT INTO "LeaveWeeklyOff" (vendor_id,franchise_id,scope_key,days,updated_by,updated_at) VALUES ($1,$2,$3,$4,$5,now())', [vendorId, policy.franchise_id, policy.scope, policy.days, actor.id]);
    }
    const planned = [];
    const existingRequests = original.get('LeaveRequest');
    for (const user of eligible) {
      const reviewer = admins.find(admin => admin.id !== user.id) || actor;
      const examples = [
        { title: '[Sample] Planned personal leave', type: 'CASUAL', status: 'PENDING', offset: 3, days: 2 },
        { title: '[Sample] Family function', type: 'PAID', status: reviewer ? 'APPROVED' : 'PENDING', offset: 9, days: 3 },
        { title: '[Sample] Medical appointment', type: 'SICK', status: reviewer ? 'REJECTED' : 'PENDING', offset: 15, days: 1 },
      ];
      let added = 0;
      for (const example of examples) {
        if (existingRequests.some(row => row.user_id === user.id && row.title === example.title && row.remark.startsWith(marker))) { summary.existing_samples_skipped++; continue; }
        let start, end;
        for (let extra = 0; extra < 90; extra += 2) {
          const candidate = shiftDate(today, example.offset + extra), last = shiftDate(candidate, example.days - 1);
          if (!candidate.startsWith(String(year)) || !last.startsWith(String(year))) break;
          const overlaps = [...existingRequests, ...planned].some(row => row.user_id === user.id && row.status !== 'REJECTED' && row.leave_date <= last && row.end_date >= candidate);
          if (!overlaps) { start = candidate; end = last; break; }
        }
        if (!start) { summary.overlapping_requests_skipped++; continue; }
        summary.requests_added++; summary.statuses[example.status]++; added++;
        planned.push({ user_id: user.id, leave_date: start, end_date: end, status: example.status });
        if (apply) await db.query('INSERT INTO "LeaveRequest" (vendor_id,user_id,franchise_id,title,type,remark,leave_date,end_date,status,rejection_reason,reviewed_by,reviewed_at,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,$10,$11,CASE WHEN $11::int IS NULL THEN NULL ELSE now()-interval \'1 day\' END,now()-interval \'3 days\',now())', [vendorId, user.id, user.franchise_id, example.title, example.type, `${marker} Sample leave request for testing the HRMS screens.`, start, end, example.status, example.status === 'REJECTED' ? 'Sample rejection: please coordinate an alternative date with your team.' : null, example.status === 'PENDING' ? null : reviewer.id]);
      }
      if (added) summary.users.push({ id: user.id, name: user.user_name, added });
    }
    if (apply) {
      for (const table of tables) {
        const current = new Map((await db.query(`SELECT to_jsonb(r) AS row FROM "${table}" r WHERE vendor_id=$1`, [vendorId])).rows.map(item => [item.row.id, item.row]));
        for (const row of original.get(table)) assert.deepEqual(current.get(row.id), row, `${table} existing row ${row.id} must not change`);
      }
      const overlaps = await db.query('SELECT a.id FROM "LeaveRequest" a JOIN "LeaveRequest" b ON a.id<b.id AND a.vendor_id=b.vendor_id AND a.user_id=b.user_id AND a.leave_date<=b.end_date AND a.end_date>=b.leave_date WHERE a.vendor_id=$1 AND a.status IN (\'PENDING\',\'APPROVED\') AND b.status IN (\'PENDING\',\'APPROVED\') LIMIT 1', [vendorId]);
      assert.equal(overlaps.rowCount, 0, 'Active requests must not overlap');
      await db.query('COMMIT'); committed = true;
    } else { await db.query('ROLLBACK'); }
    console.log(JSON.stringify({ ...summary, existing_data_preserved: true }, null, 2));
  } finally {
    if (!committed) await db.query('ROLLBACK').catch(() => {});
    await db.end();
  }
}
main().catch(error => { console.error(error.message); process.exit(1); });
