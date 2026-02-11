import cron from "node-cron";
import { prisma } from "../../../src/prisma/client";
import { NotificationService } from "../notification/notification.service";
import { NotificationType } from "../../prisma/generated";
import { sendOrderLoginReminderEmail } from "../email/brevoEmail2.service";

export function startOrderLoginReminderJob() {
  cron.schedule("0 */24 * * *", async () => {
    console.log("⏰ ORDER LOGIN REMINDER JOB STARTED");

    try {
      const tasks = await prisma.userLeadTask.findMany({
        where: {
          task_type: "Order Login",
          status: "open",
        },
        include: {
          lead: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              lead_code: true,
              status_id: true, // 🔥 IMPORTANT
              vendor_id: true,
            },
          },
          user: {
            select: {
              id: true,
              user_name: true,
              user_email: true,
            },
          },
        },
      });

      for (const task of tasks) {
        // ==========================
        // 🔒 STAGE GUARD (Type 10 ONLY)
        // ==========================
        const productionStage = await prisma.statusTypeMaster.findFirst({
          where: {
            vendor_id: task.vendor_id,
            tag: "Type 10",
          },
          select: { id: true },
        });

        if (!productionStage) continue;

        if (task.lead.status_id !== productionStage.id) {
          // ❌ Not in Production → skip reminder
          continue;
        }

        // ==========================
        // ✅ NOW SAFE TO SEND REMINDER
        // ==========================

        const leadCode =
          task.lead.lead_code ??
          `LEAD-${String(task.lead.id).padStart(4, "0")}`;

        const leadName =
          `${task.lead.firstname ?? ""} ${task.lead.lastname ?? ""}`.trim();

        const projectUrl = `${process.env.CLIENT_BASE_URL}/dashboard/leads/details/${task.lead.id}`;

        // --------------------------
        // IN-APP (ONLY ONCE)
        // --------------------------
        const alreadyNotified = await prisma.notification.findFirst({
          where: {
            vendor_id: task.vendor_id,
            entity_type: "lead",
            entity_id: task.lead_id,
            type: NotificationType.LEAD_ACTION,
            title: "Order Login Pending",
          },
        });

        if (!alreadyNotified) {
          await NotificationService.createAndSend({
            vendor_id: task.vendor_id,
            user_id: task.user_id,
            sender_id: task.created_by,
            type: NotificationType.LEAD_ACTION,
            title: "Order Login Pending",
            message: `${leadCode} - Order Login is still pending`,
            entity_type: "lead",
            entity_id: task.lead_id,
            redirect_url: `/dashboard/leads/details/${task.lead_id}`,
          });

          console.log("✅ In-app reminder sent:", leadCode);
        }

        // --------------------------
        // EMAIL (EVERY 24 HOURS)
        // --------------------------
        if (task.user.user_email) {
          await sendOrderLoginReminderEmail({
            vendor_id: task.vendor_id,
            toEmail: task.user.user_email,
            toName: task.user.user_name,
            leadCode,
            leadName,
            projectUrl,
          });

          console.log("📧 Reminder email sent:", leadCode);
        }
      }

      console.log("✅ ORDER LOGIN REMINDER JOB FINISHED");
    } catch (err) {
      console.error("❌ Order Login Reminder Job Failed", err);
    }
  });
}
