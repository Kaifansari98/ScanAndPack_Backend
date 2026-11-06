const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const utils = {};
vm.runInNewContext(compile('src/services/attendance/attendance-calendar.utils.ts'), { exports: utils, Date, require: () => ({ attendanceError(message,statusCode=400) { throw Object.assign(Error(message),{statusCode}); } }) });
const start = new Date('2026-11-05T03:30:00Z');
const input = (minutes, extras={}) => ({date:'2026-11-05',today:'2026-11-05',now:new Date('2026-11-05T18:00:00Z'),shiftMinutes:480,record:{check_in:start,check_out:new Date(start.getTime()+minutes*60000),breaks:[]},...extras});
test('full, half and short days use exact shift thresholds and deduct breaks', () => {
  assert.equal(utils.classifyCalendarDay(input(480)).status,'FULL_DAY');
  assert.equal(utils.classifyCalendarDay(input(240)).status,'HALF_DAY');
  assert.equal(utils.classifyCalendarDay(input(239.99)).status,'SHORT_DAY');
  assert.equal(utils.classifyCalendarDay(input(0)).status,'ABSENT');
  const value=input(480);value.record.breaks=[{started_at:new Date(start.getTime()+60*60000),ended_at:new Date(start.getTime()+90*60000)}];
  const result=utils.classifyCalendarDay(value);assert.equal(result.work_minutes,450);assert.equal(result.break_minutes,30);assert.equal(result.status,'HALF_DAY');
});
test('overlapping breaks are merged and intervals outside the workday are clipped', () => {
  const value=input(480);value.record.breaks=[{started_at:new Date(start.getTime()-30*60000),ended_at:new Date(start.getTime()+30*60000)},{started_at:new Date(start.getTime()+20*60000),ended_at:new Date(start.getTime()+50*60000)}];
  const result=utils.classifyCalendarDay(value);assert.equal(result.break_minutes,50);assert.equal(result.work_minutes,430);
});
test('saved shift snapshots take precedence over changed location shifts', () => {
  const value=input(480,{shiftMinutes:600});value.record.shift_minutes=480;assert.equal(utils.classifyCalendarDay(value).status,'FULL_DAY');
  delete value.record.shift_minutes;assert.equal(utils.classifyCalendarDay(value).status,'HALF_DAY');
  assert.equal(utils.classifyCalendarDay(input(180,{shiftMinutes:360})).status,'HALF_DAY');
});
test('today is provisional, while past days without attendance are absent', () => {
  assert.equal(utils.classifyCalendarDay(input(0,{record:undefined})).status,'NOT_CHECKED_IN');
  assert.equal(utils.classifyCalendarDay(input(0,{record:undefined,date:'2026-11-04'})).status,'ABSENT');
});
test('future dates use expected presence; days off are separate from absence', () => {
  const future=input(0,{record:undefined,date:'2026-11-06'});
  assert.equal(utils.classifyCalendarDay(future).status,'EXPECTED_PRESENT');
  const off=utils.classifyCalendarDay({...future,offReason:'Weekly off'});assert.equal(off.status,'OFF');assert.equal(off.absent,false);
  const leave=utils.classifyCalendarDay({...future,leaveTitle:'Approved leave'});assert.equal(leave.status,'ON_LEAVE');assert.equal(leave.absent,true);
  assert.equal(utils.classifyCalendarDay({...future,leaveTitle:'Approved leave',offReason:'Paid holiday'}).status,'OFF');
});
test('actual punches override expected leave/off status with a visible note', () => {
  const result=utils.classifyCalendarDay(input(480,{offReason:'Weekly off',leaveTitle:'Family leave'}));assert.equal(result.status,'FULL_DAY');assert.ok(result.note.includes('Worked on a scheduled day off'));assert.ok(result.note.includes('Attendance recorded on leave'));
});
test('open and overnight sessions remain live until stale, then require review', () => {
  const value=input(0,{now:new Date(start.getTime()+60*60000)});value.record.check_out=null;
  assert.equal(utils.classifyCalendarDay(value).status,'WORKING');
  value.now=new Date(start.getTime()+240*60000);assert.equal(utils.classifyCalendarDay(value).status,'HALF_DAY');
  value.date='2026-11-04';assert.equal(utils.classifyCalendarDay(value).is_open,true);
  value.now=new Date(start.getTime()+17*3600000);const stale=utils.classifyCalendarDay(value);assert.equal(stale.status,'MISSING_PUNCH');assert.equal(stale.work_minutes,null);assert.equal(stale.present,true);
});
test('long configured shifts allow overnight work before marking a punch stale', () => {
  const value=input(0,{now:new Date(start.getTime()+18*3600000),shiftMinutes:1440});value.record.check_out=null;assert.equal(utils.classifyCalendarDay(value).status,'HALF_DAY');
});
test('invalid clocks are flagged; counters reconcile headcounts without counting offs as absent', () => {
  const bad=input(480,{now:new Date(start.getTime()+60*60000)});assert.equal(utils.classifyCalendarDay(bad).status,'MISSING_PUNCH');
  const counts=utils.emptyCalendarCounts();
  for (const row of [utils.classifyCalendarDay(input(480)),utils.classifyCalendarDay(input(0,{record:undefined})),utils.classifyCalendarDay(input(0,{record:undefined,offReason:'Holiday'}))]) utils.addCalendarCount(counts,{...row,pending_leave:false});
  assert.equal(counts.people,3);assert.equal(counts.present,1);assert.equal(counts.absent,1);assert.equal(counts.off,1);assert.equal(counts.full_day,1);
});
test('shift settings reject invalid, zero, oversized and non-quarter-hour values', () => {
  assert.equal(utils.validateShiftMinutes(480),480);assert.equal(utils.validateShiftMinutes(495),495);
  for(const value of [0,-1,14,1441,481,'480',null])assert.throws(()=>utils.validateShiftMinutes(value),{statusCode:400});
});
test('calendar and shift operations require super-admin context before querying vendor data', async () => {
  const api={};const deny=async()=>{throw Object.assign(Error('Only super admins'),{statusCode:403})};
  vm.runInNewContext(compile('src/services/attendance/attendance-calendar.service.ts'),{exports:api,Date,require:name=>name.endsWith('leaves.service')?{leaveContext:deny}:name.endsWith('attendance-calendar.utils')?utils:{}});
  await assert.rejects(api.getAttendanceCalendar({},{}),{statusCode:403});await assert.rejects(api.getAttendanceCalendarDay({},{}),{statusCode:403});await assert.rejects(api.updateFranchiseShift({},1,{shift_minutes:480}),{statusCode:403});
});
