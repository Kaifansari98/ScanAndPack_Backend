import { prisma } from "../../prisma/client";
import { NotificationType } from "../../prisma/generated";
import { NotificationService } from "../notification/notification.service";
import { attendanceContext, normalizeRole, type AttendanceActor } from "../attendance/attendance-workspace.service";
import { attendanceError } from "../attendance/attendance.utils";
import { storeLeaveAttachment, signedLeaveAttachment, removeLeaveAttachment } from "../leaves/leave-attachment.service";

export const COMPLAINT_CATEGORIES = [
  "Workplace Harassment",
  "Attendance & Time Tracking",
  "Salary & Compensation",
  "Work Environment & Facilities",
  "Management & Leadership",
  "Leave & Time Off",
  "Equipment & Tools",
  "Other",
] as const;

export const COMPLAINT_STATUSES = ["PENDING", "IN_PROGRESS", "RESOLVED", "REJECTED"] as const;

export async function createComplaint(
  actor: AttendanceActor | undefined,
  input: { subject?: unknown; category?: unknown; description?: unknown },
  file?: Express.Multer.File
) {
  const context = await attendanceContext(actor);
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";

  if (!subject || subject.length > 150) attendanceError("Subject must be between 1 and 150 characters.");
  if (!category) attendanceError("Please select a valid complaint category.");
  if (!description || description.length < 5 || description.length > 2000) {
    attendanceError("Description must contain between 5 and 2000 characters.");
  }

  let key: string | undefined;
  try {
    if (file) {
      if (file.size > 5 * 1024 * 1024) attendanceError("Attachment must be 5 MB or smaller.");
      key = await storeLeaveAttachment(file, context.user.vendor_id, context.user.id);
    }

    const complaint = await prisma.employeeComplaint.create({
      data: {
        vendor_id: context.user.vendor_id,
        user_id: context.user.id,
        franchise_id: context.user.franchise_id,
        subject,
        category,
        description,
        status: "PENDING",
        ...(file && key
          ? {
              attachment_key: key,
              attachment_name: file.originalname.replace(/[\r\n\\/]/g, "_").slice(0, 200),
              attachment_mime: file.mimetype,
              attachment_size: file.size,
            }
          : {}),
      },
      include: {
        user: { select: { id: true, user_name: true, user_email: true } },
        franchise: { select: { id: true, franchise_name: true } },
      },
    });

    // Notify Super Admins
    try {
      const superAdmins = await prisma.userMaster.findMany({
        where: {
          vendor_id: context.user.vendor_id,
          status: "active",
          user_type: { user_type: "super-admin" },
        },
        select: { id: true },
      });

      for (const admin of superAdmins) {
        await NotificationService.createAndSend({
          vendor_id: context.user.vendor_id,
          user_id: admin.id,
          sender_id: context.user.id,
          type: NotificationType.APPROVAL,
          title: "New Employee Complaint / Report",
          message: `${context.user.user_name} reported: "${subject}" (${category})`,
          entity_type: "employee_complaint",
          entity_id: complaint.id,
          redirect_url: "/dashboard/hrms/complaints",
        });
      }
    } catch (notifErr) {
      console.error("Failed to send notification for complaint:", notifErr);
    }

    return complaint;
  } catch (error) {
    if (key) {
      try {
        await removeLeaveAttachment(key);
      } catch (e) {
        console.error("Error removing complaint attachment:", e);
      }
    }
    throw error;
  }
}

export async function listComplaints(
  actor: AttendanceActor | undefined,
  filters: { status?: unknown; page?: unknown; page_size?: unknown; search?: unknown }
) {
  const context = await attendanceContext(actor);
  const isSuperAdmin = normalizeRole(context.user.user_type.user_type) === "super-admin";

  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.page_size) || 10));
  const status = typeof filters.status === "string" && filters.status !== "ALL" ? filters.status : undefined;
  const search = typeof filters.search === "string" && filters.search.trim() ? filters.search.trim().toLowerCase() : undefined;

  // Non-super-admins only see complaints they filed themselves
  const where: any = {
    vendor_id: context.user.vendor_id,
    ...(!isSuperAdmin ? { user_id: context.user.id } : {}),
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { subject: { contains: search, mode: "insensitive" } },
            { category: { contains: search, mode: "insensitive" } },
            { user: { user_name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.employeeComplaint.findMany({
      where,
      include: {
        user: { select: { id: true, user_name: true, user_email: true, designation: true } },
        franchise: { select: { id: true, franchise_name: true, Department: true } },
        reviewer: { select: { id: true, user_name: true } },
      },
      orderBy: { created_at: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employeeComplaint.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
    is_super_admin: isSuperAdmin,
  };
}

export async function updateComplaintStatus(
  actor: AttendanceActor | undefined,
  id: number,
  input: { status?: unknown; admin_remarks?: unknown }
) {
  const context = await attendanceContext(actor);
  const isSuperAdmin = normalizeRole(context.user.user_type.user_type) === "super-admin";
  if (!isSuperAdmin) attendanceError("Only Super Admins can update complaint status.", 403);

  const status = String(input.status || "").toUpperCase();
  if (!COMPLAINT_STATUSES.includes(status as any)) attendanceError("Invalid complaint status.");
  const remarks = typeof input.admin_remarks === "string" ? input.admin_remarks.trim() : undefined;

  const complaint = await prisma.employeeComplaint.findFirst({
    where: { id, vendor_id: context.user.vendor_id },
  });
  if (!complaint) attendanceError("Complaint not found.", 404);

  const updated = await prisma.employeeComplaint.update({
    where: { id },
    data: {
      status,
      admin_remarks: remarks,
      reviewed_by: context.user.id,
      reviewed_at: new Date(),
    },
    include: {
      user: { select: { id: true, user_name: true } },
      reviewer: { select: { id: true, user_name: true } },
    },
  });

  // Notify the employee that status updated
  try {
    await NotificationService.createAndSend({
      vendor_id: context.user.vendor_id,
      user_id: complaint.user_id,
      sender_id: context.user.id,
      type: NotificationType.APPROVAL,
      title: "Complaint Status Updated",
      message: `Your report "${complaint.subject}" is now marked as ${status}.`,
      entity_type: "employee_complaint",
      entity_id: complaint.id,
      redirect_url: "/dashboard/hrms/employees-attendance",
    });
  } catch (err) {
    console.error("Failed to notify employee:", err);
  }

  return updated;
}

export async function getComplaintAttachmentUrl(actor: AttendanceActor | undefined, id: number) {
  const context = await attendanceContext(actor);
  const isSuperAdmin = normalizeRole(context.user.user_type.user_type) === "super-admin";

  const complaint = await prisma.employeeComplaint.findFirst({
    where: {
      id,
      vendor_id: context.user.vendor_id,
      ...(!isSuperAdmin ? { user_id: context.user.id } : {}),
    },
  });

  if (!complaint || !complaint.attachment_key) attendanceError("Attachment not found.", 404);
  const url = await signedLeaveAttachment(complaint.attachment_key, complaint.attachment_name || "complaint-attachment");
  return { url, name: complaint.attachment_name };
}

