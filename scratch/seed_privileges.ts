import { prisma } from "../src/prisma/client";

async function main() {
  const query = `
    INSERT INTO "PrivilegeMaster" (
      "vendor_id",
      "code",
      "parent_module",
      "child_module",
      "action",
      "label",
      "description",
      "is_active",
      "created_at",
      "updated_at"
    ) VALUES 
    -- 1. Leads
    (2, 'leads.open_leads.assign_task.approval_request', 'leads', 'Open Leads > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Open Leads', true, NOW(), NOW()),
    (2, 'leads.initial_site_measurement.assign_task.approval_request', 'leads', 'ISM Leads > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for ISM Stage', true, NOW(), NOW()),
    (2, 'leads.designing_stage.assign_task.approval_request', 'leads', 'Designing Stage > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Designing Stage', true, NOW(), NOW()),
    (2, 'leads.booking_stage.assign_task.approval_request', 'leads', 'Booking Done > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Booking Stage', true, NOW(), NOW()),

    -- 2. Projects
    (2, 'project.final_measurement.assign_task.approval_request', 'project', 'Final Measurement > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Final Measurement', true, NOW(), NOW()),
    (2, 'project.client_documentation.assign_task.approval_request', 'project', 'Client Documentation > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Client Documentation', true, NOW(), NOW()),
    (2, 'project.client_approval.assign_task.approval_request', 'project', 'Client Approval > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Client Approval', true, NOW(), NOW()),

    -- 3. Production
    (2, 'production.tech_check.assign_task.approval_request', 'production', 'Tech Check > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Tech Check', true, NOW(), NOW()),
    (2, 'production.order_login.assign_task.approval_request', 'production', 'Order Login > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Order Login', true, NOW(), NOW()),
    (2, 'production.production.assign_task.approval_request', 'production', 'Under Production > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Production Stage', true, NOW(), NOW()),
    (2, 'production.ready_to_dispatch.assign_task.approval_request', 'production', 'Ready To Dispatch > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Ready To Dispatch', true, NOW(), NOW()),

    -- 4. Installation
    (2, 'installation.site_readiness.assign_task.approval_request', 'installation', 'Site Readiness > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Site Readiness', true, NOW(), NOW()),
    (2, 'installation.dispatch_planning.assign_task.approval_request', 'installation', 'Dispatch Planning > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Dispatch Planning', true, NOW(), NOW()),
    (2, 'installation.dispatch.assign_task.approval_request', 'installation', 'Dispatch > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Dispatch Stage', true, NOW(), NOW()),
    (2, 'installation.under_installation.assign_task.approval_request', 'installation', 'Under Installation > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Under Installation', true, NOW(), NOW()),
    (2, 'installation.final_handover.assign_task.approval_request', 'installation', 'Final Handover > Details of Lead', 'Approval Request', 'Approval Request', 'Assign Task Approval Request for Final Handover', true, NOW(), NOW())

    ON CONFLICT ("vendor_id", "code") 
    DO UPDATE SET 
      "parent_module" = EXCLUDED."parent_module",
      "child_module" = EXCLUDED."child_module",
      "action" = EXCLUDED."action",
      "label" = EXCLUDED."label",
      "description" = EXCLUDED."description",
      "is_active" = EXCLUDED."is_active",
      "updated_at" = NOW();
  `;

  try {
    const result = await prisma.$executeRawUnsafe(query);
    console.log(`Query executed successfully. Affected rows: ${result}`);
  } catch (error) {
    console.error("Error executing query:", error);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
