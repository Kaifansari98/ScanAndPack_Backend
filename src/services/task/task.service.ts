import { prisma } from "../../prisma/client"; // adjust your path

export class TaskService {
  /**
   * Get all tasks for a given vendor and user, including relations
   */
  static async getTasksByVendorAndUser(vendorId: number, userId: number) {
    const tasks = await prisma.userLeadTask.findMany({
        where: {
          vendor_id: vendorId,
          user_id: userId,
          status: "open",
        },
        select: {
          id: true,
          status: true,
          due_date: true,
          task_type: true,
          remark: true,
          closed_by: true,
          closed_at: true,
          created_by: true,
          created_at: true,
          updated_by: true,
          updated_at: true,
      
          // 👤 Who created the task
          createdBy: {
            select: {
              id: true,
              user_name: true,
            },
          },

          // 🔑 Lead details
          lead: {
            select: {
              id: true,
              account_id: true,
              vendor_id: true,
              firstname: true,
              lastname: true,
              contact_no: true,
              statusType: { select: { type: true } },
              siteType: { select: { type: true } },
              productMappings: {
                select: { productType: { select: { type: true } } },
              },
              leadProductStructureMapping: {
                select: { productStructure: { select: { type: true } } },
              },
              
            },
          },
        },
        orderBy: { created_at: "desc" },
    });      

    // ✅ Shape data into your desired format
    return tasks.map((task) => ({
        userLeadTask: {
          id: task.id,
          status: task.status,
          due_date: task.due_date,
          task_type: task.task_type,
          remark: task.remark,
          closed_by: task.closed_by,
          closed_at: task.closed_at,
          created_by: task.created_by,
          created_by_name: task.createdBy?.user_name || null,  // 👈 human readable
          created_at: task.created_at,
          updated_by: task.updated_by,
          updated_at: task.updated_at,
        },
        leadMaster: {
          id: task.lead?.id,
          account_id: task.lead?.account_id,
          vendor_id: task?.lead?.vendor_id,
          name: `${task.lead?.firstname} ${task.lead?.lastname}`,
          phone_number: task.lead?.contact_no,
          site_type: task.lead?.siteType?.type,
          lead_status: task.lead?.statusType?.type,
          product_type: task.lead?.productMappings.map((pm) => pm.productType.type),
          product_structure: task.lead?.leadProductStructureMapping.map(
            (ps) => ps.productStructure.type
          ),
        },
      }));
    }      
}