// Usage: node scripts/seed-walkin-questions.cjs --vendor-id 1 [--apply]
// Uses the configured database. Dry-run by default; one transaction; identical sets are skipped.
require('dotenv').config({ quiet: true });
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const { transformSync } = require('@swc/core');
const { Client } = createRequire(require.resolve('@prisma/adapter-pg'))('pg');
const cache = new Map();
function load(file) {
  file=path.resolve(file);
  if(cache.has(file))return cache.get(file).exports;
  const mod={exports:{}};cache.set(file,mod);
  const {code}=transformSync(fs.readFileSync(file,'utf8'),{filename:file,jsc:{parser:{syntax:'typescript'},target:'es2020'},module:{type:'commonjs'}});
  const native=createRequire(file);
  new Function('require','module','exports',code)(name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):native(name),mod,mod.exports);
  return mod.exports;
}
const {walkinLeadDefaults}=load(path.join(__dirname,'../src/data/walkinLeadDefaults.ts'));
const {defaultCategory,validateQuestions}=load(path.join(__dirname,'../src/services/leadModuleServices/walkinLeadQuestions/validation.ts'));
const vendorId=Number(process.argv[process.argv.indexOf('--vendor-id')+1]);
if(!process.argv.includes('--vendor-id') || !Number.isSafeInteger(vendorId) || vendorId<=0)throw new Error('--vendor-id must be a positive integer');
const apply=process.argv.includes('--apply');
const db=new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
(async()=>{
  try {
    await db.connect();
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout = '5s'");
    const vendor=(await db.query('SELECT id,vendor_name FROM "VendorMaster" WHERE id=$1',[vendorId])).rows[0];
    if(!vendor)throw new Error('Vendor not found');
    const actor=(await db.query(`SELECT u.id FROM "UserMaster" u JOIN "UserTypeMaster" t ON u.user_type_id=t.id WHERE u.vendor_id=$1 AND u.status='active' AND t.user_type IN ('admin','super-admin') ORDER BY u.id LIMIT 1`,[vendorId])).rows[0];
    if(!actor)throw new Error('No active vendor admin available for seed audit fields');
    const products=(await db.query('SELECT id,type FROM "ProductTypeMaster" WHERE vendor_id=$1 AND status=\'active\' ORDER BY id',[vendorId])).rows;
    const plan=[];
    for(const product of products){
      const category=defaultCategory(product.type);
      const questions=validateQuestions(walkinLeadDefaults[category].questions);
      const params=[vendorId,product.id,JSON.stringify(questions),actor.id];
      const existing=(await db.query('SELECT id, questions = $3::jsonb AS identical FROM "WalkinLeadQuestionnaire" WHERE vendor_id=$1 AND product_type_id=$2 FOR UPDATE',params.slice(0,3))).rows[0];
      plan.push({product_type_id:product.id,type:product.type,category,questions:questions.length,action:existing?.identical?'unchanged':existing?'replace':'insert'});
      if(apply && !existing?.identical) await db.query(`INSERT INTO "WalkinLeadQuestionnaire" (vendor_id,product_type_id,questions,version,created_by,updated_by,created_at,updated_at) VALUES ($1,$2,$3::jsonb,1,$4,$4,NOW(),NOW()) ON CONFLICT (vendor_id,product_type_id) DO UPDATE SET questions=EXCLUDED.questions,version="WalkinLeadQuestionnaire".version+1,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,params);
    }
    await db.query(apply?'COMMIT':'ROLLBACK');
    console.log(JSON.stringify({applied:apply,vendor,actor_id:actor.id,questionnaires:plan,total_questions:plan.reduce((sum,item)=>sum+item.questions,0)},null,2));
  }catch(error){await db.query('ROLLBACK').catch(()=>{});console.error(error.message || error.code);process.exitCode=1;}
  finally{await db.end();}
})();
