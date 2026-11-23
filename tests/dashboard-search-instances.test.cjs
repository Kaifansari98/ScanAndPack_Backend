const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/services/dashboard/dashboard.service.ts'), 'utf8');
const file = ts.createSourceFile('dashboard.ts', source, ts.ScriptTarget.Latest, true);
const methods = [];
function visit(node) {
  if (ts.isMethodDeclaration(node) && ['getSalesExecutiveAllStageLeads', 'getAdminAllStageLeads'].includes(node.name.getText(file))) {
    methods.push(node.getText(file));
  }
  ts.forEachChild(node, visit);
}
visit(file);
assert.equal(methods.length, 2);
const compiled = ts.transpileModule(`class SearchService { ${methods.join('\n')} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;

for (const admin of [false, true]) {
  test(`${admin ? 'admin' : 'user'} search includes instance data only in stages 8–10 and keeps access filters`, async () => {
    const queries = [];
    const instances = [{ id: 55, quantity_index: 2, is_tech_check_completed: true, is_order_login_completed: false }];
    const prisma = {
      statusTypeMaster: { findMany: async () => Array.from({ length: 17 }, (_, i) => ({ id: i + 1, tag: `Type ${i + 1}` })) },
      leadMaster: { findMany: async (query) => {
        queries.push(query);
        return [{ id: 42, account_id: 7, lead_code: 'CRM-42', firstname: 'Example', lastname: 'Client',
          ...(query.select.productStructureInstances ? { productStructureInstances: instances } : {}),
        }];
      } },
    };
    const Service = new Function('prisma', 'LeadUserStatus', 'ActivityStatus', `${compiled}\nreturn SearchService;`)(
      prisma, { active: 'active' }, { onGoing: 'onGoing', onHold: 'onHold', lostApproval: 'lostApproval', lost: 'lost' },
    );
    const service = new Service();
    const result = admin
      ? await service.getAdminAllStageLeads(1, 9)
      : await service.getSalesExecutiveAllStageLeads(1, 3);
    assert.equal(queries.length, 17);
    for (const query of queries) {
      assert.equal(query.where.vendor_id, 1);
      assert.equal(query.where.is_deleted, false);
      if (admin) {
        assert.equal(query.where.franchise_id, 9);
        assert.equal(query.where.activity_status, 'onGoing');
      } else {
        assert.deepEqual(query.where.userMappings, { some: { user_id: 3, status: 'active' } });
        assert.deepEqual(query.where.activity_status, { notIn: ['onHold', 'lostApproval', 'lost'] });
      }
      assert.equal(Boolean(query.select.productStructureInstances), [8, 9, 10].includes(query.where.status_id));
    }
    for (const key of ['techCheckStage', 'orderLoginStage', 'productionStage']) {
      assert.deepEqual(result[key][0].productStructureInstances, instances);
      assert.equal(result[key][0].name, 'Example Client');
    }
    assert.equal(result.openStage[0].productStructureInstances, undefined);
  });
}
