const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the service without a database or Redis connection.
function setup() {
  let user;
  let mappings = [];
  let failMapping = false;
  let supervisors = [];
  let leads = [];
  let leadMappings = [];
  let failLeadMapping = false;
  let rooms = [];
  let chatMembers = [];
  let failChatMapping = false;
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(condition => matches(row, condition));
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('gt' in value) return row[key] > value.gt;
      if ('not' in value) return row[key] !== value.not;
    }
    return row[key] === value;
  });
  const prisma = {
    leadChatRoom: {
      findMany: async ({ where }) => rooms.filter(room => matches(room, where)),
    },
    leadChatMember: {
      deleteMany: async ({ where }) => { chatMembers = chatMembers.filter(member => !matches(member, where)); },
      createMany: async ({ data, skipDuplicates }) => {
        if (failChatMapping) throw new Error('chat membership failed');
        assert.equal(skipDuplicates, true);
        for (const member of data) {
          if (!chatMembers.some(existing => existing.chat_room_id === member.chat_room_id && existing.user_id === member.user_id)) {
            chatMembers.push({ ...member });
          }
        }
      },
    },
    leadMaster: {
      findMany: async ({ where, take }) => leads.filter(lead => matches(lead, where)).sort((a, b) => a.id - b.id).slice(0, take),
    },
    leadUserMapping: {
      findMany: async ({ where }) => leadMappings.filter(mapping => matches(mapping, where)).sort((a, b) => a.id - b.id),
      updateMany: async ({ where, data }) => {
        leadMappings.filter(mapping => matches(mapping, where)).forEach(mapping => Object.assign(mapping, data));
      },
      createMany: async ({ data }) => {
        if (failLeadMapping) throw new Error('lead mapping failed');
        for (const mapping of data) leadMappings.push({ id: Math.max(0, ...leadMappings.map(m => m.id)) + 1, ...mapping });
      },
    },
    franchiseMaster: {
      count: async ({ where }) => where.id.in.filter(id => [10, 20, 30].includes(id) && where.vendor_id === 1).length,
      findMany: async ({ where }) => {
        const direct = where.OR[0].users.some;
        const mapping = where.OR[1].siteSupervisorFranchiseMappings.some;
        assert.equal(mapping.vendor_id, where.vendor_id);
        assert.equal(mapping.supervisor, direct);
        return where.id.in.filter(id => supervisors.some(supervisor =>
          supervisor.vendor_id === direct.vendor_id && supervisor.id !== direct.id?.not &&
          direct.user_type.user_type.in.includes(supervisor.role) &&
          (supervisor.franchise_id === id || supervisor.mappedIds?.includes(id))
        )).map(id => ({ id, franchise_name: `Franchise ${id}` }));
      },
    },
    userTypeMaster: { findUnique: async ({ where }) => ({ user_type: where.id === 99 ? 'sales-executive' : 'site-supervisor' }) },
    userMaster: {
      findUnique: async () => user && ({ ...user, siteSupervisorFranchiseMappings: mappings }),
      create: async ({ data }) => (user = { id: 7, ...data }),
      update: async ({ data }) => (user = { ...user, ...data }),
    },
    siteSupervisorFranchiseMapping: {
      deleteMany: async ({ where }) => { mappings = mappings.filter(m => where.franchise_id?.notIn.includes(m.franchise_id)); },
      upsert: async ({ create, update }) => {
        if (failMapping) throw new Error('mapping failed');
        const existing = mappings.find(m => m.franchise_id === create.franchise_id);
        if (existing) Object.assign(existing, update);
        else mappings.push(create);
      },
    },
    $transaction: async fn => {
      const previousUser = user && { ...user };
      const previousMappings = mappings.map(m => ({ ...m }));
      const previousLeadMappings = leadMappings.map(m => ({ ...m }));
      const previousChatMembers = chatMembers.map(m => ({ ...m }));
      try { return await fn(prisma); }
      catch (error) { user = previousUser; mappings = previousMappings; leadMappings = previousLeadMappings; chatMembers = previousChatMembers; throw error; }
    },
  };
  const source = fs.readFileSync(require('node:path').join(__dirname, '../src/services/userServices/user.service.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => {
    if (name.endsWith('/prisma/client')) return { prisma };
    if (name === 'bcryptjs') return { hash: async () => 'hashed' };
    if (name.endsWith('/config/redis')) return { redis: {} };
    throw new Error(`Unexpected import ${name}`);
  } });
  return { ...exports, setSupervisors: value => { supervisors = value; },
    setLeads: value => { leads = value; }, setLeadMappings: value => { leadMappings = value; },
    failLeads: () => { failLeadMapping = true; },
    setRooms: value => { rooms = value; }, setChatMembers: value => { chatMembers = value; },
    failChat: () => { failChatMapping = true; },
    state: () => ({ user, mappings, leadMappings, chatMembers }), fail: () => { failMapping = true; } };
}
const payload = { vendor_id: 1, user_type_id: 2, user_name: 'Test', user_email: 'test@example.com', user_contact: '123', user_timezone: 'Asia/Kolkata', password: 'test' };

test('single and legacy selections store the franchise on UserMaster without extra franchise mappings', async () => {
  for (const selection of [{ franchise_ids: [10] }, { franchise_id: 10 }]) {
    const s = setup();
    await s.createUserService({ ...payload, ...selection }, 4);
    assert.equal(s.state().user.franchise_id, 10);
    assert.equal(s.state().mappings.length, 0);
    assert.equal(s.state().user.franchise_ids, undefined);
  }
});

test('multiple selections keep first primary, deduplicate and sync on edit', async () => {
  const s = setup();
  await s.createUserService({ ...payload, franchise_ids: [20, 10, 20] }, 4);
  assert.equal(s.state().user.franchise_id, 20);
  assert.deepEqual(s.state().mappings.map(m => m.franchise_id), [20, 10]);
  await s.updateUserService(7, { franchise_ids: [10, 30] }, 5);
  assert.equal(s.state().user.franchise_id, 10);
  assert.deepEqual(s.state().mappings.map(m => m.franchise_id), [10, 30]);
  assert.equal(s.state().mappings[0].created_by, 4);
  assert.equal(s.state().mappings[0].updated_by, 5);
  await s.updateUserService(7, { user_name: 'Renamed' }, 5);
  assert.equal(s.state().mappings.length, 2);
  await s.updateUserService(7, { franchise_ids: [30] }, 5);
  assert.equal(s.state().user.franchise_id, 30);
  assert.equal(s.state().mappings.length, 0);
});

test('rejects empty, malformed and foreign-vendor franchises before writing', async () => {
  for (const franchise_ids of [[], [999], [10, 999], [null], ['10'], [0], [1.5], '10']) {
    const s = setup();
    await assert.rejects(s.createUserService({ ...payload, franchise_ids }), { statusCode: 400 });
    assert.equal(s.state().user, undefined);
  }
  const s = setup();
  await s.createUserService({ ...payload, franchise_ids: [10, 20] });
  await assert.rejects(s.updateUserService(7, { franchise_ids: [999] }), { statusCode: 400 });
  assert.equal(s.state().user.franchise_id, 10);
  assert.equal(s.state().mappings.length, 2);
});

test('mapping failure rolls back user and mapping changes in the transaction', async () => {
  const s = setup();
  await s.createUserService({ ...payload, franchise_ids: [10, 20] });
  s.fail();
  await assert.rejects(s.updateUserService(7, { franchise_ids: [30, 20] }), /mapping failed/);
  assert.equal(s.state().user.franchise_id, 10);
  assert.deepEqual(s.state().mappings.map(m => m.franchise_id), [10, 20]);
});


test('create requires confirmation for direct or mapped supervisors and writes only after confirmation', async () => {
  for (const assignment of [{ franchise_id: 10 }, { franchise_id: 30, mappedIds: [10] }]) {
    const s = setup();
    s.setSupervisors([{ id: 8, vendor_id: 1, role: 'site-supervisor', ...assignment }]);
    await assert.rejects(s.createUserService({ ...payload, franchise_ids: [10, 20] }), error => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'SUPERVISOR_CONFIRMATION_REQUIRED');
      assert.equal(error.franchises[0].franchise_name, 'Franchise 10');
      return true;
    });
    assert.equal(s.state().user, undefined);
    assert.equal(s.state().mappings.length, 0);
    await s.createUserService({ ...payload, franchise_ids: [10, 20], confirm_additional_supervisor: true });
    assert.equal(s.state().user.franchise_id, 10);
    assert.equal(s.state().user.confirm_additional_supervisor, undefined);
  }
});

test('update excludes itself but prompts for other supervisors, including unchanged franchises', async () => {
  const s = setup();
  await s.createUserService({ ...payload, franchise_ids: [10, 20] });
  s.setSupervisors([{ id: 7, vendor_id: 1, role: 'site-supervisor', franchise_id: 10, mappedIds: [20] }]);
  await s.updateUserService(7, { user_name: 'First edit' });
  s.setSupervisors([{ id: 8, vendor_id: 1, role: 'site-supervisor', franchise_id: 20 }]);
  await assert.rejects(s.updateUserService(7, { user_name: 'Second edit' }), { code: 'SUPERVISOR_CONFIRMATION_REQUIRED' });
  assert.equal(s.state().user.user_name, 'First edit');
  await s.updateUserService(7, { user_name: 'Second edit', confirm_additional_supervisor: true });
  assert.equal(s.state().user.user_name, 'Second edit');
});

test('ignores other vendors and roles; confirms when changing to site supervisor', async () => {
  const s = setup();
  s.setSupervisors([
    { id: 8, vendor_id: 2, role: 'site-supervisor', franchise_id: 10 },
    { id: 9, vendor_id: 1, role: 'sales-executive', franchise_id: 10 },
  ]);
  await s.createUserService({ ...payload, franchise_ids: [10] });
  s.setSupervisors([{ id: 8, vendor_id: 1, role: 'site-supervisor', franchise_id: 10 }]);
  await s.updateUserService(7, { user_type_id: 99 });
  await assert.rejects(s.updateUserService(7, { user_type_id: 2 }), { code: 'SUPERVISOR_CONFIRMATION_REQUIRED' });
  await s.updateUserService(7, { user_type_id: 2, confirm_additional_supervisor: true });
  assert.equal(s.state().user.user_type_id, 2);
});

test('confirmation must be boolean true and cannot bypass franchise validation', async () => {
  const s = setup();
  s.setSupervisors([{ id: 8, vendor_id: 1, role: 'site-supervisor', franchise_id: 10 }]);
  await assert.rejects(s.createUserService({ ...payload, franchise_ids: [10], confirm_additional_supervisor: 'true' }), { code: 'SUPERVISOR_CONFIRMATION_REQUIRED' });
  await assert.rejects(s.createUserService({ ...payload, franchise_ids: [999], confirm_additional_supervisor: true }), { statusCode: 400 });
});

const lead = (id, franchise_id, extra = {}) => ({ id, franchise_id, vendor_id: 1, account_id: id + 100, is_deleted: false, ...extra });
const leadMapping = (id, lead_id, user_id, extra = {}) => ({ id, lead_id, user_id, vendor_id: 1, account_id: lead_id + 100, type: 'site-supervisor', status: 'active', ...extra });
const activeSupervisors = s => s.state().leadMappings.filter(m => m.type === 'site-supervisor' && m.status === 'active');

test('assigns selected franchise leads and replaces only their site supervisors', async () => {
  const s = setup();
  s.setLeads([lead(1, 10), lead(2, 20), lead(3, 30), lead(4, 10, { vendor_id: 2 }),
    lead(5, 10, { is_deleted: true }), lead(6, 10, { account_id: null })]);
  const originals = [leadMapping(1, 1, 8), leadMapping(2, 2, 9), leadMapping(3, 3, 8),
    leadMapping(4, 4, 8, { vendor_id: 2 }), leadMapping(5, 5, 8),
    leadMapping(6, 1, 12, { type: 'sales-executive' })];
  s.setLeadMappings(originals.map(m => ({ ...m })));
  await s.createUserService({ ...payload, franchise_ids: [10, 20] }, 4);
  for (const leadId of [1, 2]) {
    const assigned = activeSupervisors(s).filter(m => m.lead_id === leadId);
    assert.equal(assigned.length, 1);
    assert.equal(assigned[0].user_id, 7);
    assert.equal(assigned[0].account_id, leadId + 100);
    assert.equal(assigned[0].created_by, 4);
    assert.equal(s.state().leadMappings.find(m => m.id === leadId).status, 'inactive');
  }
  for (const untouched of originals.slice(2)) {
    assert.deepEqual(s.state().leadMappings.find(m => m.id === untouched.id), untouched);
  }
  assert.equal(s.state().leadMappings.some(m => m.lead_id === 6), false);
});

test('single franchise and legacy assignment also assign leads', async () => {
  for (const selection of [{ franchise_ids: [10] }, { franchise_id: 10 }]) {
    const s = setup();
    s.setLeads([lead(1, 10)]);
    await s.createUserService({ ...payload, ...selection });
    assert.equal(activeSupervisors(s)[0].user_id, 7);
    assert.equal(activeSupervisors(s)[0].created_by, 7);
  }
});

test('franchise edits reuse existing mappings without duplicate active assignments', async () => {
  const s = setup();
  s.setLeads([lead(1, 10), lead(2, 20), lead(3, 30)]);
  await s.createUserService({ ...payload, franchise_ids: [10] });
  s.setLeadMappings([leadMapping(1, 1, 7), leadMapping(2, 2, 7, { status: 'inactive' }),
    leadMapping(3, 2, 7), leadMapping(4, 2, 9), leadMapping(5, 3, 9)]);
  await s.updateUserService(7, { franchise_ids: [20, 30] }, 5);
  for (const leadId of [2, 3]) {
    const assigned = activeSupervisors(s).filter(m => m.lead_id === leadId);
    assert.equal(assigned.length, 1);
    assert.equal(assigned[0].user_id, 7);
  }
  assert.equal(s.state().leadMappings.find(m => m.id === 2).status, 'active');
  assert.equal(s.state().leadMappings.find(m => m.id === 2).updated_by, 5);
  const count = s.state().leadMappings.length;
  await s.updateUserService(7, { franchise_ids: [20, 30] }, 5);
  assert.equal(s.state().leadMappings.length, count);
});

test('other roles and profile edits do not replace lead assignments; role change does', async () => {
  const s = setup();
  s.setLeads([lead(1, 10)]);
  s.setLeadMappings([leadMapping(1, 1, 8)]);
  await s.createUserService({ ...payload, user_type_id: 99, franchise_ids: [10] });
  assert.equal(activeSupervisors(s)[0].user_id, 8);
  await s.updateUserService(7, { user_type_id: 2 }, 4);
  assert.equal(activeSupervisors(s)[0].user_id, 7);
  s.setLeadMappings([leadMapping(1, 1, 8)]);
  await s.updateUserService(7, { user_name: 'Renamed' }, 4);
  assert.equal(activeSupervisors(s)[0].user_id, 8);
});

test('lead assignment failure rolls back user, franchises and previous lead assignments', async () => {
  const s = setup();
  s.setLeads([lead(1, 10), lead(2, 20)]);
  await s.createUserService({ ...payload, franchise_ids: [10] });
  s.setLeadMappings([leadMapping(1, 1, 7), leadMapping(2, 2, 8)]);
  const before = JSON.stringify(s.state());
  s.failLeads();
  await assert.rejects(s.updateUserService(7, { franchise_ids: [10, 20] }, 4), /lead mapping failed/);
  assert.equal(JSON.stringify(s.state()), before);
});

test('processes all leads across multiple batches', async () => {
  const s = setup();
  s.setLeads(Array.from({ length: 1001 }, (_, index) => lead(index + 1, 10)));
  await s.createUserService({ ...payload, franchise_ids: [10] });
  assert.equal(activeSupervisors(s).length, 1001);
  assert.equal(new Set(activeSupervisors(s).map(m => m.lead_id)).size, 1001);
});

test('confirmation leaves leads untouched until the confirmed save', async () => {
  const s = setup();
  s.setLeads([lead(1, 10)]);
  s.setLeadMappings([leadMapping(1, 1, 8)]);
  s.setSupervisors([{ id: 8, vendor_id: 1, role: 'site-supervisor', franchise_id: 10 }]);
  await assert.rejects(s.createUserService({ ...payload, franchise_ids: [10] }),
    { code: 'SUPERVISOR_CONFIRMATION_REQUIRED' });
  assert.equal(activeSupervisors(s)[0].user_id, 8);
  await s.createUserService({ ...payload, franchise_ids: [10], confirm_additional_supervisor: true }, 4);
  assert.equal(activeSupervisors(s).length, 1);
  assert.equal(activeSupervisors(s)[0].user_id, 7);
});

test('lead mapping failure during creation restores previous assignments and removes the new user', async () => {
  const s = setup();
  s.setLeads([lead(1, 10)]);
  s.setLeadMappings([leadMapping(1, 1, 8)]);
  s.failLeads();
  await assert.rejects(s.createUserService({ ...payload, franchise_ids: [10, 20] }, 4), /lead mapping failed/);
  assert.equal(s.state().user, undefined);
  assert.equal(s.state().mappings.length, 0);
  assert.equal(activeSupervisors(s).length, 1);
  assert.equal(activeSupervisors(s)[0].user_id, 8);
});

const chatMember = (chat_room_id, user_id, extra = {}) => ({ chat_room_id, user_id, added_by: 4, ...extra });

test('replaces previous supervisors in each selected lead chat and preserves unrelated members', async () => {
  const s = setup();
  s.setLeads([lead(1, 10), lead(2, 20), lead(3, 30), lead(4, 10, { vendor_id: 2 })]);
  s.setLeadMappings([leadMapping(1, 1, 8), leadMapping(2, 2, 9),
    leadMapping(3, 1, 11, { status: 'inactive' }), leadMapping(4, 1, 12, { type: 'sales-executive' }),
    leadMapping(5, 3, 8), leadMapping(6, 4, 8, { vendor_id: 2 })]);
  s.setRooms([{ id: 101, lead_id: 1, vendor_id: 1 }, { id: 102, lead_id: 2, vendor_id: 1 },
    { id: 103, lead_id: 3, vendor_id: 1 }, { id: 104, lead_id: 4, vendor_id: 2 }]);
  const preserved = [chatMember(101, 12), chatMember(101, 9), chatMember(101, 15),
    chatMember(102, 8), chatMember(103, 8), chatMember(104, 8)];
  s.setChatMembers([chatMember(101, 8), chatMember(101, 11), chatMember(102, 9), ...preserved]);
  await s.createUserService({ ...payload, franchise_ids: [10, 20] }, 5);
  assert.deepEqual(s.state().chatMembers, [...preserved, chatMember(101, 7, { added_by: 5 }), chatMember(102, 7, { added_by: 5 })]);
});

test('franchise edits add missing chat members and keep existing new supervisor membership without duplicates', async () => {
  const s = setup();
  s.setLeads([lead(1, 10), lead(2, 20)]);
  await s.createUserService({ ...payload, franchise_ids: [10] });
  s.setRooms([{ id: 101, lead_id: 1, vendor_id: 1 }, { id: 102, lead_id: 2, vendor_id: 1 }]);
  s.setLeadMappings([leadMapping(1, 1, 7), leadMapping(2, 2, 8)]);
  const existing = chatMember(101, 7, { joined_at: 'original', added_by: 3 });
  s.setChatMembers([existing]);
  await s.updateUserService(7, { franchise_ids: [10, 20] }, 5);
  await s.updateUserService(7, { franchise_ids: [10, 20] }, 5);
  assert.deepEqual(s.state().chatMembers, [existing, chatMember(102, 7, { added_by: 5 })]);
});

test('chat membership failure rolls back supervisor, franchise and membership changes together', async () => {
  const s = setup();
  s.setLeads([lead(1, 10), lead(2, 20)]);
  await s.createUserService({ ...payload, franchise_ids: [10] });
  s.setLeadMappings([leadMapping(1, 1, 7), leadMapping(2, 2, 8)]);
  s.setRooms([{ id: 102, lead_id: 2, vendor_id: 1 }]);
  s.setChatMembers([chatMember(102, 8), chatMember(102, 12)]);
  const before = JSON.stringify(s.state());
  s.failChat();
  await assert.rejects(s.updateUserService(7, { franchise_ids: [10, 20] }, 5), /chat membership failed/);
  assert.equal(JSON.stringify(s.state()), before);
});

test('confirmation and profile edits do not change chat membership', async () => {
  const s = setup();
  s.setLeads([lead(1, 10)]);
  s.setLeadMappings([leadMapping(1, 1, 8)]);
  s.setRooms([{ id: 101, lead_id: 1, vendor_id: 1 }]);
  s.setChatMembers([chatMember(101, 8)]);
  s.setSupervisors([{ id: 8, vendor_id: 1, role: 'site-supervisor', franchise_id: 10 }]);
  await assert.rejects(s.createUserService({ ...payload, franchise_ids: [10] }),
    { code: 'SUPERVISOR_CONFIRMATION_REQUIRED' });
  assert.deepEqual(s.state().chatMembers, [chatMember(101, 8)]);
  await s.createUserService({ ...payload, franchise_ids: [10], confirm_additional_supervisor: true });
  s.setChatMembers([chatMember(101, 8)]);
  await s.updateUserService(7, { user_name: 'Renamed', confirm_additional_supervisor: true });
  assert.deepEqual(s.state().chatMembers, [chatMember(101, 8)]);
});
