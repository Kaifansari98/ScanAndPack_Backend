const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/services/clientComplaints/complaintLeadPicker.service.ts'), 'utf8');
class ComplaintError extends Error { constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; } }
const actor = (role = 'super-admin', vendorId = 1) => ({ role, vendorId, actorId: 42 });
const plain = value => JSON.parse(JSON.stringify(value));
function matches(row, where) {
  return Object.entries(where || {}).every(([key, value]) => {
    if (key === 'AND') return value.every(clause => matches(row, clause));
    if (key === 'OR') return value.some(clause => matches(row, clause));
    if (value && typeof value === 'object') {
      if ('lt' in value) return row[key] < value.lt;
      if ('contains' in value) return String(row[key] || '').toLowerCase().includes(value.contains.toLowerCase());
    }
    return row[key] === value;
  });
}
function setup() {
  const queries = [];
  const leads = Array.from({length:37}, (_, i) => ({ id:i+1, vendor_id:1, franchise_id:i<20?1:2, is_deleted:false, firstname:i===9?'Mukesh':'Client', lastname:i===9?'Khanna':String(i+1), lead_code:`TEST-${i+1}`, email:'private@example.test', account_id:i===0?null:10 }));
  leads.push({...leads[0],id:90,vendor_id:2}, {...leads[0],id:91,is_deleted:true});
  const franchises = [{id:1,vendor_id:1,franchise_name:'Andheri'}, {id:2,vendor_id:1,franchise_name:'Bandra'}, {id:3,vendor_id:2,franchise_name:'Another vendor'}];
  const project = (row, select) => Object.fromEntries(Object.keys(select).map(key=>[key,row[key]]));
  const prisma = {
    leadMaster: { findMany: async query => {queries.push({table:'leads',...plain(query)});return leads.filter(row=>matches(row,query.where)).sort((a,b)=>b.id-a.id).slice(0,query.take).map(row=>project(row,query.select));} },
    franchiseMaster: {
      findFirst: async query => {queries.push({table:'franchise',...plain(query)});return franchises.find(row=>matches(row,query.where)) || null;},
      findMany: async query => {queries.push({table:'franchises',...plain(query)});return franchises.filter(row=>matches(row,query.where)).map(row=>project(row,query.select));},
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require(name){if(name.includes('prisma/client'))return{prisma};if(name.includes('clientComplaints.service'))return{ComplaintError};throw Error(name);}});
  return {...exports,queries,leads};
}
test('initial load returns 15 vendor leads, including unassigned/no-account leads, with minimal fields', async()=>{
  const service=setup();const result=await service.getComplaintLeadOptions(actor(),{});
  assert.equal(result.rows.length,15);assert.equal(result.rows[0].id,37);assert.equal(result.next_cursor,23);
  assert.deepEqual(Object.keys(result.rows[0]),['id','firstname','lastname','lead_code']);
  assert.equal(service.queries[0].take,16);
  assert.equal(service.queries[0].where.vendor_id,1);assert.equal(service.queries[0].where.is_deleted,false);
});
test('cursor pagination loads 15 more at a time without duplicates or new-record shifts', async()=>{
  const service=setup();const first=await service.getComplaintLeadOptions(actor(),{});
  service.leads.push({...service.leads[0],id:100});
  const second=await service.getComplaintLeadOptions(actor(),{after_id:first.next_cursor});
  const last=await service.getComplaintLeadOptions(actor(),{after_id:second.next_cursor});
  assert.equal(second.rows.length,15);assert.equal(last.rows.length,7);assert.equal(last.next_cursor,null);
  const ids=[...first.rows,...second.rows,...last.rows].map(row=>row.id);
  assert.equal(new Set(ids).size,37);assert.ok(!ids.includes(90));assert.ok(!ids.includes(91));assert.ok(!ids.includes(100));assert.ok(ids.includes(1));
});
test('a single selected franchise filters every page and belongs to the authenticated vendor', async()=>{
  const service=setup();const first=await service.getComplaintLeadOptions(actor(),{franchise_id:'1'});
  const last=await service.getComplaintLeadOptions(actor(),{franchise_id:'1',after_id:first.next_cursor});
  assert.equal(first.rows.length,15);assert.equal(last.rows.length,5);assert.ok([...first.rows,...last.rows].every(row=>row.id<=20));
  await assert.rejects(()=>service.getComplaintLeadOptions(actor(),{franchise_id:3}),{statusCode:404});
  assert.ok(service.queries.filter(query=>query.table==='leads').every(query=>query.where.franchise_id===1));
});
test('search matches full names and lead codes case-insensitively inside the franchise scope', async()=>{
  const service=setup();const name=await service.getComplaintLeadOptions(actor(),{franchise_id:1,search:'  mukesh KHANNA  '});
  assert.equal(name.rows.length,1);assert.equal(name.rows[0].lead_code,'TEST-10');
  const code=await service.getComplaintLeadOptions(actor(),{search:'test-37'});assert.equal(code.rows[0].id,37);
  const wrongFranchise=await service.getComplaintLeadOptions(actor(),{franchise_id:2,search:'Mukesh'});assert.equal(wrongFranchise.rows.length,0);assert.equal(wrongFranchise.next_cursor,null);
});
test('franchise options list only the authenticated vendor’s franchises', async()=>{
  const service=setup();const result=await service.getComplaintLeadFranchises(actor());
  assert.deepEqual(plain(result),[{id:1,franchise_name:'Andheri'},{id:2,franchise_name:'Bandra'}]);
  assert.equal(service.queries[0].where.vendor_id,1);
});
test('browsing endpoints reject non-Super Admin roles before reading data', async()=>{
  const service=setup();for(const role of ['head-site-supervisor','site-supervisor','admin','sales-executive']){
    await assert.rejects(()=>service.getComplaintLeadOptions(actor(role),{}),{statusCode:403});
    await assert.rejects(()=>service.getComplaintLeadFranchises(actor(role)),{statusCode:403});
  }assert.equal(service.queries.length,0);
});
test('malformed cursors, franchise filters and search values fail before reading leads', async()=>{
  for(const query of [{after_id:0},{after_id:-1},{after_id:'bad'},{after_id:1.2},{after_id:2147483648},{franchise_id:[1,2]},{franchise_id:'1,2'},{franchise_id:0},{search:['a']}]){
    const service=setup();await assert.rejects(()=>service.getComplaintLeadOptions(actor(),query),{statusCode:400});assert.equal(service.queries.length,0);
  }
});
