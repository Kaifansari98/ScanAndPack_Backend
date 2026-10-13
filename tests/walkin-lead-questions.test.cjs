const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Transpile only this feature; inject the database so tests never contact live services.
function setup() {
  const products = [
    { id: 1, vendor_id: 10, type: 'Kitchen', status: 'active' },
    { id: 2, vendor_id: 10, type: 'Wardrobe', status: 'active' },
    { id: 3, vendor_id: 11, type: 'Kitchen', status: 'active' },
    { id: 4, vendor_id: 10, type: 'Study Unit', status: 'active' },
  ];
  const overrides = [];
  let responses = [];
  const uploads = [];
  const lead = { id: 50, vendor_id: 10, source_id: 7, created_by: 9, assign_to: null, is_draft: false, is_deleted: false };
  const matches = (row, where) => Object.entries(where).every(([k,v]) => v && typeof v === 'object' && 'in' in v ? v.in.includes(row[k]) : row[k] === v);
  const db = {
    productTypeMaster: { findFirst: async ({where}) => products.find(p => matches(p, where)) ?? null },
    sourceMaster: { findFirst: async ({where}) => [{id:7,vendor_id:10,type:'Walk-in'}, {id:8,vendor_id:10,type:'Online'}].find(s => matches(s, where)) ?? null },
    walkinLeadQuestionnaire: {
      findUnique: async ({where}) => overrides.find(o => matches(o,where.vendor_id_product_type_id)) ?? null,
      upsert: async ({where,create,update}) => { const existing = overrides.find(o => matches(o, where.vendor_id_product_type_id)); if (existing) Object.assign(existing,{...update,version:existing.version+1}); else overrides.push({id:overrides.length+100,version:1,...create}); },
      deleteMany: async ({where}) => { const i=overrides.findIndex(o=>matches(o,where)); if(i>=0)overrides.splice(i,1); },
    },
    walkinLeadUpload: { findMany: async ({where}) => uploads.filter(u=>matches(u,where)) },
    walkinLeadResponse: { findFirst: async ({where}) => responses.find(r=>matches(r,where)) ?? null, update: async ({where,data}) => { const row=responses.find(r=>r.id===where.id); Object.assign(row,data); return row; }, upsert: async ({where,create,update}) => { const row=responses.find(r=>matches(r,where.lead_id_product_type_id)); if(row){Object.assign(row,update);return row;} const created={id:responses.length+1,...create};responses.push(created);return created; } },
    leadMaster: {findFirst: async ({where}) => matches(lead,where) ? lead : null},
    leadUserMapping: {findFirst: async ()=>null},
    leadProductMapping: {findMany: async ()=>[{product_type_id:1},{product_type_id:2}]},
    $transaction: async fn => {const saved=structuredClone(responses);try{return await fn(db);}catch(e){responses=saved;throw e;}},
  };
  const cache = new Map();
  function load(file) {
    file=path.resolve(file);
    if(cache.has(file)) return cache.get(file).exports;
    const mod={exports:{}};cache.set(file,mod);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
    const native=Module.createRequire(file);
    const requireLocal=name=> {
      if(name.endsWith('/prisma/client'))return {prisma:db};
      if(name.endsWith('/utils/wasabiClient'))return {generateSignedUrl:async()=> 'https://storage.test/signed',uploadWalkinReferenceFile:async()=> 'walkin/test.pdf'};
      if(name.endsWith('/utils/logger'))return {error:()=>{}};
      return name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):native(name);
    };
    new Function('require','module','exports',code)(requireLocal,mod,mod.exports);
    return mod.exports;
  }
  const root=path.join(__dirname,'../src/services/leadModuleServices/walkinLeadQuestions');
  return { ...load(root+'/validation.ts'), ...load(root+'/questionnaire.service.ts'), ...load(root+'/response.service.ts'), defaults:load(path.join(__dirname,'../src/data/walkinLeadDefaults.ts')).walkinLeadDefaults, db, overrides, uploads, lead, controllers:load(path.join(__dirname,'../src/controllers/leadModuleControllers/walkinLeadQuestions.controller.ts')), responses:()=>responses };
}
function answersFor(form) {
  return Object.fromEntries(form.questions.map(q=>[q.key, q.type==='single_select'?q.options[0]:q.type==='multi_select'?[q.options[0]]:q.type==='number'?3:q.type==='file'?['12345678-1234-1234-1234-123456789012']:'N/A']));
}
const groupFor = form => ({product_type_id:form.product_type_id,questionnaire_key:form.questionnaire_key,questionnaire_version:form.questionnaire_version,answers:answersFor(form)});
const save = (s,groups,extra={})=>s.saveWalkinAnswers(s.db,{vendorId:10,leadId:50,actorId:9,sourceId:7,productTypeIds:[1],groups,draft:false,...extra});

test('all 41 workbook questions retain required flags, types and options',()=>{
  const s=setup(); const sets=Object.values(s.defaults); assert.deepEqual(sets.map(x=>x.questions.length),[9,8,8,8,8]);
  for(const set of sets){const questions=s.validateQuestions(set.questions);assert.ok(questions.every(q=>q.required));assert.equal(s.validateAnswers(questions,answersFor({questions}),false).is_complete,true);}
  assert.equal(s.defaults.wardrobe.questions[0].type,'multi_select');
  assert.equal(s.defaults.office_furniture.questions[1].type,'number');
});
test('defaults map furniture names and unknown furniture uses Other Furniture',async()=>{
  const s=setup(); assert.equal((await s.getQuestionnaire(10,1)).origin,'default');
  assert.equal(s.defaultCategory('Modular Kitchen'),'kitchen');assert.equal(s.defaultCategory('TV Unit / Console'),'tv_unit_console');assert.equal(s.defaultCategory('Consoles'),'tv_unit_console');
  assert.equal((await s.getQuestionnaire(10,4)).default_category,'other_furniture');
  await assert.rejects(s.getQuestionnaire(10,3),/not found/);
});
test('vendor override replaces only its furniture type and reset restores defaults',async()=>{
  const s=setup();const questions=[{key:'style',label:'Preferred style?',type:'text',required:true,options:[],sort_order:1}];
  const first=await s.saveQuestionnaire(10,1,9,questions);assert.equal(first.origin,'vendor');assert.equal(first.questions.length,1);
  assert.equal((await s.getQuestionnaire(10,2)).origin,'default');
  assert.equal((await s.saveQuestionnaire(10,1,9,questions)).questionnaire_version,2);
  assert.equal((await s.resetQuestionnaire(10,1)).origin,'default');
});
test('invalid vendor question definitions are rejected',()=>{
  const s=setup();const q={key:'q',label:'Question',type:'single_select',required:true,options:[],sort_order:1};
  assert.throws(()=>s.validateQuestions([q]),/options/);
  assert.throws(()=>s.validateQuestions([{...q,type:'text'},{...q,type:'text'}]),/duplicate/);
  assert.throws(()=>s.validateQuestions([]));
});
test('required fields, unknown keys and invalid options fail; drafts allow missing values',async()=>{
  const s=setup(), form=await s.getQuestionnaire(10,1), values=answersFor(form);
  assert.throws(()=>s.validateAnswers(form.questions,{},false),/Required/);
  assert.equal(s.validateAnswers(form.questions,{},true).is_complete,false);
  assert.throws(()=>s.validateAnswers(form.questions,{...values,kitchen_1:'Sometimes'},false),/Invalid answer/);
  assert.throws(()=>s.validateAnswers(form.questions,{...values,unknown:'test'},false),/Unknown/);
  assert.throws(()=>s.validateAnswers(form.questions,{...values,kitchen_3:'   '},false),/Required/);
  assert.equal(s.validateAnswers(form.questions,values,false).is_complete,true);
});
test('multi-select duplicates, bad numbers, and arbitrary file URLs fail',()=>{
  const s=setup();const wardrobe=s.defaults.wardrobe.questions;const office=s.defaults.office_furniture.questions;const other=s.defaults.other_furniture.questions;
  assert.throws(()=>s.validateAnswers(wardrobe,{...answersFor({questions:wardrobe}),wardrobe_1:['Individual','Individual']},false),/Invalid/);
  for(const value of [-1,0,1.5,'5',Infinity])assert.throws(()=>s.validateAnswers(office,{...answersFor({questions:office}),office_furniture_2:value},false),/Invalid/);
  assert.throws(()=>s.validateAnswers(other,{...answersFor({questions:other}),other_furniture_6:['https://example.com/file.pdf']},false),/Invalid/);
});
test('JSON parsing rejects malformed payloads and duplicate furniture groups',()=>{
  const s=setup();assert.throws(()=>s.parseAnswerGroups('{bad'),/valid JSON/);
  const g={product_type_id:1,questionnaire_key:'default:kitchen',questionnaire_version:1,answers:{}};
  assert.equal(s.parseAnswerGroups(JSON.stringify([g])).length,1);
  assert.throws(()=>s.parseAnswerGroups([g,g]),/duplicate/);
});
test('answers save with a snapshot, retries update the same row',async()=>{
  const s=setup(), form=await s.getQuestionnaire(10,1), g=groupFor(form);
  await save(s,[g]); await save(s,[g]); assert.equal(s.responses().length,1);assert.equal(s.responses()[0].is_complete,true);
  assert.deepEqual(s.responses()[0].question_snapshot,form.questions);
  await s.saveQuestionnaire(10,1,9,[{key:'new',label:'New question',type:'text',required:true,options:[],sort_order:1}]);
  assert.equal(s.responses()[0].question_snapshot[0].label,form.questions[0].label);
});
test('non-walk-in, wrong vendor, unselected and missing furniture groups are rejected',async()=>{
  const s=setup(), g=groupFor(await s.getQuestionnaire(10,1));
  await assert.rejects(save(s,[g],{sourceId:8}),/only to Walk-in/);
  await assert.rejects(save(s,[g],{vendorId:11}),/only to Walk-in/);
  await assert.rejects(save(s,[g],{productTypeIds:[2]}),/not selected/);
  await assert.rejects(save(s,[g],{productTypeIds:[1,2]}),/every selected/);
  assert.equal(s.responses().length,0);
});
test('stale version rejected with 409 and invalid later group causes no partial save',async()=>{
  const s=setup(), a=groupFor(await s.getQuestionnaire(10,1)), b=groupFor(await s.getQuestionnaire(10,2));
  await assert.rejects(save(s,[{...a,questionnaire_version:99}]),e=>e.statusCode===409);
  await assert.rejects(save(s,[a,{...b,answers:{}}],{productTypeIds:[1,2]}),/Required/);
  assert.equal(s.responses().length,0);
});
test('uploads must exist in the same vendor and match file constraints',async()=>{
  const s=setup(), g=groupFor(await s.getQuestionnaire(10,4));
  await assert.rejects(save(s,[g],{productTypeIds:[4]}),/files/);
  s.uploads.push({id:g.answers.other_furniture_6[0],vendor_id:11,mime_type:'application/pdf',size_bytes:50});
  await assert.rejects(save(s,[g],{productTypeIds:[4]}),/files/);
  s.uploads[0].vendor_id=10;await save(s,[g],{productTypeIds:[4]});assert.equal(s.responses().length,1);
});
test('existing lead answers require access, and draft submissions may be partial',async()=>{
  const s=setup();await assert.rejects(s.requireLeadAccess(10,50,777,'sales-executive'),/access/);
  await assert.rejects(s.requireLeadAccess(11,50,9,'admin'),/not found/);
  s.lead.is_draft=true;const form=await s.getQuestionnaire(10,1);
  await s.updateLeadAnswers(10,50,9,'sales-executive',[{...groupFor(form),answers:{kitchen_1:'Daily'}}]);
  assert.equal(s.responses()[0].is_complete,false);
});

function request(overrides={}) {
  return {user:{id:9,vendor_id:10,user_type:'sales-executive'},params:{vendorId:'10',productTypeId:'1'},query:{product_type_ids:'1'},body:{},...overrides};
}
async function call(handler,req) {
  const res={code:200,body:null,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler(req,res);return res;
}
test('question controller rejects cross-vendor and malformed requests',async()=>{
  const s=setup();let res=await call(s.controllers.getQuestions,request({params:{vendorId:'11'}}));assert.equal(res.code,403);
  res=await call(s.controllers.getQuestions,request({query:{product_type_ids:'1,abc'}}));assert.equal(res.code,400);
  res=await call(s.controllers.getQuestions,request());assert.equal(res.code,200);assert.equal(res.body.data[0].questions.length,9);
  res=await call(s.controllers.getQuestions,request({query:{product_type_ids:'1',source_id:'8'}}));assert.equal(res.code,400);
});
test('master controller restricts writes and resets to vendor admins',async()=>{
  const s=setup();const body={questions:[{key:'q',label:'Style?',type:'text',required:true,options:[],sort_order:1}]};
  assert.equal((await call(s.controllers.putQuestions,request({body}))).code,403);
  assert.equal((await call(s.controllers.deleteQuestions,request())).code,403);
  const res=await call(s.controllers.putQuestions,request({body,user:{id:9,vendor_id:10,user_type:'admin'}}));
  assert.equal(res.code,200);assert.equal(res.body.data.origin,'vendor');
});
test('upload controller rejects misleading file MIME and signatures before storage',async()=>{
  const s=setup();const req=request({file:{buffer:Buffer.from('<script>bad</script>'),mimetype:'image/png',originalname:'fake.png',size:20}});
  const res=await call(s.controllers.uploadReference,req);assert.equal(res.code,400);assert.match(res.body.message,/contents/);
});
test('a database failure rolls back previously written furniture responses',async()=>{
  const s=setup(), a=groupFor(await s.getQuestionnaire(10,1)), b=groupFor(await s.getQuestionnaire(10,2));
  const original=s.db.walkinLeadResponse.upsert;
  s.db.walkinLeadResponse.upsert=async args=>{if(args.create.product_type_id===2)throw new Error('database write failed');return original(args);};
  await assert.rejects(s.updateLeadAnswers(10,50,9,'admin',[a,b]),/database write failed/);
  assert.equal(s.responses().length,0);
});
test('a single saved answer is edited against the stored snapshot',async()=>{
  const s=setup(), form=await s.getQuestionnaire(10,1);await save(s,[groupFor(form)]);
  // Later master edits must not block or reshape edits to already-saved answers.
  await s.saveQuestionnaire(10,1,9,[{key:'new',label:'New question',type:'text',required:true,options:[],sort_order:1}]);
  const row=await s.updateLeadAnswer(10,50,9,'sales-executive',1,'kitchen_1','Rarely');
  assert.equal(row.answers.kitchen_1,'Rarely');assert.equal(row.answers.kitchen_2,groupFor(form).answers.kitchen_2);assert.equal(row.updated_by,9);
  await assert.rejects(s.updateLeadAnswer(10,50,9,'sales-executive',1,'kitchen_1','Sometimes'),/Invalid answer/);
  await assert.rejects(s.updateLeadAnswer(10,50,9,'sales-executive',1,'kitchen_1',undefined),/required/);
  await assert.rejects(s.updateLeadAnswer(10,50,9,'sales-executive',1,'missing','x'),e=>e.statusCode===404);
  await assert.rejects(s.updateLeadAnswer(10,50,9,'sales-executive',2,'wardrobe_1',['x']),e=>e.statusCode===404);
  await assert.rejects(s.updateLeadAnswer(10,50,777,'sales-executive',1,'kitchen_1','Daily'),/access/);
  assert.equal(s.responses()[0].answers.kitchen_1,'Rarely');
  s.lead.is_draft=true;const cleared=await s.updateLeadAnswer(10,50,9,'sales-executive',1,'kitchen_1','');
  assert.equal(cleared.answers.kitchen_1,undefined);assert.equal(cleared.is_complete,false);
});
