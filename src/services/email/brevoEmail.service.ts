"use strict";

import { prisma } from "../../prisma/client";
import logger from "../../../src/utils/logger";

export type BrevoEmailPayload = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string;
  replyToEmail?: string;
  replyToName?: string;
  senderName?: string;
};

export type BrevoEmailResult =
  | { success: true }
  | { success: false; status?: number; error?: string }
  | { success: false; skipped: true; reason: string };

export type LeadCreatedEmailPayload = {
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  contact: string;
  furnitureType: string;
  furnitureStructure: string;
  createdDate: string;
  createdBy: string;
  leadUrl?: string;
};

export type TaskAssignedEmailPayload = {
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  taskTitle: string;
  leadName: string;
  assignedBy: string;
  dueDate: string;
  remark?: string | null;
  taskUrl?: string;
};

export type ChatMentionEmailPayload = {
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  senderName: string;
  leadName: string;
  messageText: string;
  conversationUrl?: string;
};

export type MajorMilestoneEmailPayload = {
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  milestoneName: string;
  completedOn: string;
  detailsUrl?: string;
};

export type LeadOnHoldEmailPayload = {
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedByRole?: string;
  updatedAt: string;
  remark: string;
  leadUrl?: string;
};

export type LeadActiveEmailPayload = {
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedByRole?: string;
  updatedAt: string;
  remark: string;
  leadUrl?: string;
};

export type LeadLostApprovalEmailPayload = {
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  markedBy: string;
  markedAt: string;
  remark: string;
  leadUrl?: string;
};

export type LeadLostApprovedEmailPayload = {
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  approvedBy: string;
  approvedAt: string;
  remark: string;
  leadUrl?: string;
};

export type LeadLostRejectedEmailPayload = {
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  rejectedBy: string;
  rejectedAt: string;
  remark: string;
  leadUrl?: string;
};

export type PaymentAddedEmailPayload = {
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  amount: string;
  paymentType: string;
  updatedBy: string;
  leadUrl?: string;
};

export interface ReadyToDispatchEmailPayload {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  markedBy: string;
  markedAt: string;
  projectUrl?: string;
}

export interface MiscERDUpdatedEmailPayload {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  fulfillmentDate: string;
  projectUrl?: string;
}

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const LEAD_CREATED_TEMPLATE_KEY = "LEAD_CREATED";
const LEAD_ASSIGNED_TEMPLATE_KEY = "LEAD_ASSIGNED";
const LEAD_ASSIGNED_SITE_SUPERVISOR_TEMPLATE_KEY =
  "LEAD_ASSIGNED_SITE_SUPERVISOR";
const TASK_ASSIGNED_TEMPLATE_KEY = "TASK_ASSIGNED";
const CHAT_MENTION_TEMPLATE_KEY = "CHAT_MENTION";
const MILESTONE_TEMPLATE_KEY = "MILESTONE_ACHIEVED";
const LEAD_ON_HOLD_TEMPLATE_KEY = "LEAD_ON_HOLD";
const LEAD_ACTIVE_TEMPLATE_KEY = "LEAD_ACTIVE";
const LEAD_LOST_APPROVAL_TEMPLATE_KEY = "LEAD_LOST_APPROVAL";
const LEAD_LOST_APPROVED_TEMPLATE_KEY = "LEAD_LOST_APPROVED";
const LEAD_LOST_REJECTED_TEMPLATE_KEY = "LEAD_LOST_REJECTED";
const PAYMENT_ADDED_TEMPLATE_KEY = "PAYMENT_ADDED";
const READY_TO_DISPATCH_TEMPLATE_KEY = "READY_TO_DISPATCH";
const MISC_REQUIREMENT_TEMPLATE_KEY = "MISC_REQUIREMENT";
const MISC_ERD_UPDATED_TEMPLATE_KEY = "MISC_ERD_UPDATED";
const MISC_READY_TEMPLATE_KEY = "MISC_READY";
const MISC_RESOLVED_TEMPLATE_KEY = "MISC_RESOLVED";
const FINAL_HANDOVER_TEMPLATE_KEY = "FINAL_HANDOVER";
const PROJECT_COMPLETED_TEMPLATE_KEY = "PROJECT_COMPLETED";
const TECH_CHECK_APPROVED_TEMPLATE_KEY = "TECHCHECK_DOCUMENT_APPROVED";
const TECH_CHECK_REJECTED_TEMPLATE_KEY = "TECHCHECK_DOCUMENT_REJECT";
const REVISED_DOCUMENTS_UPLOADED_TEMPLATE_KEY = "REVISED_DOCUMENTS_UPLOADED";
const ORDER_LOGIN_ENABLED_TEMPLATE_KEY = "ORDER_LOGIN_ENABLED";
const ORDER_LOGIN_ASSIGNED_TEMPLATE_KEY = "ORDER_LOGIN_ASSIGNED";

export const LEAD_STAGE_TEMPLATE_KEYS = {
  ISM_STAGE: "LEAD_MOVED_TO_ISM_STAGE",
  DESIGNING_STAGE: "LEAD_MOVED_TO_DESIGNING_STAGE",
  BOOKING_STAGE: "LEAD_MOVED_TO_BOOKING_STAGE",
  CLIENT_DOCUMENTATION_STAGE: "LEAD_MOVED_TO_CLIENT_DOCUMENTATION_STAGE",
  CLIENT_APPROVAL_STAGE: "LEAD_MOVED_TO_CLIENT_APPROVAL_STAGE",
  ORDER_LOGIN_STAGE: "LEAD_MOVED_TO_ORDER_LOGIN_STAGE",
  PRODUCTION_STAGE: "LEAD_MOVED_TO_PRODUCTION_STAGE",
  READY_TO_DISPATCH_STAGE: "LEAD_MOVED_TO_READY_TO_DISPATCH_STAGE",
  DISPATCH_PLANNING_STAGE: "LEAD_MOVED_TO_DISPATCH_PLANNING_STAGE",
  DISPATCH_STAGE: "LEAD_MOVED_TO_DISPATCH_STAGE",
  UNDER_INSTALLATION_STAGE: "LEAD_MOVED_TO_UNDER_INSTALLATION_STAGE",
  FINAL_HANDOVER_STAGE: "LEAD_MOVED_TO_FINAL_HANDOVER_STAGE",
};

const renderTemplate = (template: string, values: Record<string, string>) => {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : match;
  });
};

export const sendBrevoEmail = async (
  payload: BrevoEmailPayload,
): Promise<BrevoEmailResult> => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const defaultSenderName = process.env.BREVO_SENDER_NAME || "Furnix CRM";
  const senderName = payload.senderName || defaultSenderName;
  const replyTo = payload.replyToEmail || process.env.BREVO_REPLY_TO_EMAIL;
  const replyToName = payload.replyToName || senderName;
  const brevoEnabled = process.env.BREVO_ENABLED === "true";

  if (!brevoEnabled) {
    logger.info("Brevo email skipped: disabled", {
      to: payload.toEmail,
      subject: payload.subject,
    });
    return {
      success: false,
      skipped: true,
      reason: "Brevo disabled",
    };
  }

  if (!apiKey || !senderEmail) {
    logger.warn("Brevo email skipped: missing configuration", {
      missing_api_key: !apiKey,
      missing_sender_email: !senderEmail,
    });
    return {
      success: false,
      skipped: true,
      reason: "Missing Brevo configuration",
    };
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: senderEmail,
          name: senderName,
        },
        to: [
          {
            email: payload.toEmail,
            name: payload.toName || undefined,
          },
        ],
        subject: payload.subject,
        htmlContent: payload.html,
        ...(payload.text ? { textContent: payload.text } : {}),
        ...(replyTo
          ? {
              replyTo: {
                email: replyTo,
                name: replyToName,
              },
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn("Brevo email failed", {
        status: response.status,
        body,
      });
      return {
        success: false,
        status: response.status,
        error: body,
      };
    }

    logger.info("Brevo email sent", {
      to: payload.toEmail,
      subject: payload.subject,
    });

    return { success: true };
  } catch (error: any) {
    logger.warn("Brevo email error", {
      error: error?.message,
    });
    return { success: false, error: error?.message };
  }
};

export const sendLeadCreatedEmail = async (
  payload: LeadCreatedEmailPayload,
): Promise<BrevoEmailResult> => {
  const defaultSubject = `New Lead Created: ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "A new lead has been created.",
    "Lead Details:",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Contact Details: ${payload.contact}`,
    `Furniture Type: ${payload.furnitureType}`,
    `Furniture Structure: ${payload.furnitureStructure}`,
    `Created Date: ${payload.createdDate}`,
    `Created By: ${payload.createdBy}`,
    "",
    payload.leadUrl ? `View Lead: ${payload.leadUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">New Lead Created</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">A new lead has been created.</p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead Details</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Contact Details</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.contact}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Furniture Type</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.furnitureType}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Furniture Structure</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.furnitureStructure}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Created Date</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.createdDate}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Created By</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.createdBy}</td>
            </tr>
          </table>
        </div>
        ${
          payload.leadUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.leadUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Lead
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    contact: payload.contact,
    furnitureType: payload.furnitureType,
    furnitureStructure: payload.furnitureStructure,
    createdDate: payload.createdDate,
    createdBy: payload.createdBy,
    leadUrl: payload.leadUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_CREATED_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: LEAD_CREATED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: LEAD_CREATED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template?.subject?.trim().length
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template?.text?.trim().length
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template?.html?.trim().length
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendLeadAssignedEmail = async (
  payload: LeadCreatedEmailPayload,
): Promise<BrevoEmailResult> => {
  const defaultSubject = `New Lead Assigned: ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "New lead has been assigned to you.",
    "Lead Summary",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Contact Details: ${payload.contact}`,
    `Furniture Type: ${payload.furnitureType}`,
    `Furniture Structure: ${payload.furnitureStructure}`,
    `Created Date: ${payload.createdDate}`,
    "",
    "Please connect with the client and start capturing requirements.",
    payload.leadUrl ? `View Lead: ${payload.leadUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">New Lead Assigned</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          New lead has been assigned to you.
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead Summary</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Contact Details</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.contact}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Furniture Type</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.furnitureType}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Furniture Structure</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.furnitureStructure}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Created Date</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.createdDate}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 16px 0 0; color: #4b5563;">
          Please connect with the client and start capturing requirements.
        </p>
        ${
          payload.leadUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.leadUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Lead
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    contact: payload.contact,
    furnitureType: payload.furnitureType,
    furnitureStructure: payload.furnitureStructure,
    createdDate: payload.createdDate,
    createdBy: payload.createdBy,
    leadUrl: payload.leadUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_ASSIGNED_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: LEAD_ASSIGNED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: LEAD_ASSIGNED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendLeadAssignedToSiteSupervisorEmail = async (
  payload: LeadCreatedEmailPayload,
): Promise<BrevoEmailResult> => {
  const defaultSubject = `Lead Assigned: ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "A lead has been assigned to you.",
    "Lead Summary",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Contact Details: ${payload.contact}`,
    `Furniture Type: ${payload.furnitureType}`,
    `Furniture Structure: ${payload.furnitureStructure}`,
    `Created Date: ${payload.createdDate}`,
    "",
    "Please review the lead details and plan the next steps.",
    payload.leadUrl ? `View Lead: ${payload.leadUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Lead Assigned</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          A lead has been assigned to you.
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead Summary</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Contact Details</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.contact}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Furniture Type</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.furnitureType}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Furniture Structure</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.furnitureStructure}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Created Date</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.createdDate}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 16px 0 0; color: #4b5563;">
          Please review the lead details and plan the next steps.
        </p>
        ${
          payload.leadUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.leadUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Lead
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    contact: payload.contact,
    furnitureType: payload.furnitureType,
    furnitureStructure: payload.furnitureStructure,
    createdDate: payload.createdDate,
    createdBy: payload.createdBy,
    leadUrl: payload.leadUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_ASSIGNED_SITE_SUPERVISOR_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: LEAD_ASSIGNED_SITE_SUPERVISOR_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: LEAD_ASSIGNED_SITE_SUPERVISOR_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendTaskAssignedEmail = async (
  payload: TaskAssignedEmailPayload,
): Promise<BrevoEmailResult> => {
  const defaultSubject = `Task Assigned: ${payload.taskTitle} for ${payload.leadCode} ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "You have been assigned a new task in the CRM.",
    "Task Details",
    `Task: ${payload.taskTitle}`,
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Assigned By: ${payload.assignedBy}`,
    `Due Date: ${payload.dueDate}`,
    `Remarks: ${payload.remark ?? "—"}`,
    "",
    "Please review the task and take the necessary action within the defined timeline.",
    payload.taskUrl ? `View Task: ${payload.taskUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Task Assigned</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          You have been assigned a new task in the CRM.
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Task Details</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Task</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.taskTitle}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Assigned By</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.assignedBy}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Due Date</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.dueDate}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Remarks</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.remark ?? "—"}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 16px 0 0; color: #4b5563;">
          Please review the task and take the necessary action within the defined timeline.
        </p>
        ${
          payload.taskUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.taskUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Task
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    taskTitle: payload.taskTitle,
    leadName: payload.leadName,
    assignedBy: payload.assignedBy,
    dueDate: payload.dueDate,
    remark: payload.remark ?? "",
    taskUrl: payload.taskUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: TASK_ASSIGNED_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: TASK_ASSIGNED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: TASK_ASSIGNED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendChatMentionEmail = async (
  payload: ChatMentionEmailPayload,
): Promise<BrevoEmailResult> => {
  const defaultSubject = `You Were Mentioned on ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `You were mentioned by ${payload.senderName} in a conversation related to the following lead:`,
    `Lead: ${payload.leadCode} - ${payload.leadName}`,
    "Message:",
    `"${payload.messageText}"`,
    "",
    "Please review the message and respond if required.",
    payload.conversationUrl
      ? `View Conversation: ${payload.conversationUrl}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">You Were Mentioned</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          You were mentioned by <strong>${payload.senderName}</strong> in a conversation related to the following lead:
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead</p>
          <p style="margin: 0; color: #111827;">${payload.leadName}</p>
        </div>
        <div style="margin-top: 12px; border-left: 3px solid #111827; padding-left: 12px; color: #111827;">
          <p style="margin: 0 0 6px; font-weight: 600;">Message</p>
          <p style="margin: 0;">“${payload.messageText}”</p>
        </div>
        <p style="margin: 16px 0 0; color: #4b5563;">
          Please review the message and respond if required.
        </p>
        ${
          payload.conversationUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.conversationUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Conversation
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    senderName: payload.senderName,
    leadName: payload.leadName,
    messageText: payload.messageText,
    conversationUrl: payload.conversationUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: CHAT_MENTION_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: CHAT_MENTION_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: CHAT_MENTION_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendMajorMilestoneEmail = async (
  payload: MajorMilestoneEmailPayload,
): Promise<BrevoEmailResult> => {
  const formatMilestoneDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  const completedOn = formatMilestoneDate(payload.completedOn);
  const defaultSubject = `Milestone Achieved: ${payload.milestoneName} on ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "A major milestone has been achieved for the following lead:",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Milestone: ${payload.milestoneName}`,
    `Achieved On: ${completedOn}`,
    "",
    "This marks an important progression in the project lifecycle. Please review the details and proceed with the next required actions.",
    payload.detailsUrl
      ? `View Lead / Project Details: ${payload.detailsUrl}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Milestone Achieved</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          A major milestone has been achieved for the following lead:
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Milestone</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.milestoneName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Achieved On</td>
              <td style="padding: 4px 0; font-weight: 600;">${completedOn}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 16px 0 0; color: #4b5563;">
          This marks an important progression in the project lifecycle. Please review the details and proceed with the next required actions.
        </p>
        ${
          payload.detailsUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.detailsUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Lead / Project Details
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    milestoneName: payload.milestoneName,
    completedOn: payload.completedOn,
    detailsUrl: payload.detailsUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: MILESTONE_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: MILESTONE_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: MILESTONE_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendLeadOnHoldEmail = async (
  payload: LeadOnHoldEmailPayload,
): Promise<BrevoEmailResult> => {
  const formatOnHoldDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  const updatedAt = formatOnHoldDate(payload.updatedAt);
  const updatedByRole = payload.updatedByRole?.trim() || "Sales Executive";
  const defaultSubject = `Lead Placed On Hold: ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The following lead has been marked On Hold by the ${updatedByRole}.`,
    "Lead Details",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Updated By: ${payload.updatedBy}`,
    `Marked on: ${updatedAt}`,
    "Remark Provided:",
    `"${payload.remark}"`,
    "",
    payload.leadUrl ? `View Lead Details: ${payload.leadUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Lead Placed On Hold</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          The following lead has been marked On Hold by the ${updatedByRole}.
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead Details</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Updated By</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.updatedBy}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Marked on</td>
              <td style="padding: 4px 0; font-weight: 600;">${updatedAt}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 16px 0 6px; color: #4b5563;">Remark Provided:</p>
        <p style="margin: 0; color: #111827;">"${payload.remark}"</p>
        ${
          payload.leadUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.leadUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Lead Details
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    updatedBy: payload.updatedBy,
    updatedAt,
    updatedByRole,
    remark: payload.remark,
    leadUrl: payload.leadUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_ON_HOLD_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: LEAD_ON_HOLD_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: LEAD_ON_HOLD_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendLeadActiveEmail = async (
  payload: LeadActiveEmailPayload,
): Promise<BrevoEmailResult> => {
  const formatActiveDate = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };
  const updatedAt = formatActiveDate(payload.updatedAt);
  const updatedByRole = payload.updatedByRole?.trim() || "Sales Executive";
  const defaultSubject = `Lead marked Active: ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The following lead has been marked Active by the ${updatedByRole}.`,
    "Lead Details",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Updated By: ${payload.updatedBy}`,
    `Marked on: ${updatedAt}`,
    "Remark Provided:",
    `"${payload.remark}"`,
    "",
    payload.leadUrl ? `View Lead Details: ${payload.leadUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Lead marked Active</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          The following lead has been marked Active by the ${updatedByRole}.
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead Details</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Updated By</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.updatedBy}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Marked on</td>
              <td style="padding: 4px 0; font-weight: 600;">${updatedAt}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 16px 0 6px; color: #4b5563;">Remark Provided:</p>
        <p style="margin: 0; color: #111827;">"${payload.remark}"</p>
        ${
          payload.leadUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.leadUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Lead Details
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    updatedBy: payload.updatedBy,
    updatedAt,
    updatedByRole,
    remark: payload.remark,
    leadUrl: payload.leadUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_ACTIVE_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: LEAD_ACTIVE_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: LEAD_ACTIVE_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendLeadLostApprovalEmail = async (
  payload: LeadLostApprovalEmailPayload,
): Promise<BrevoEmailResult> => {
  const defaultSubject = `Approval Required: Lead Marked as Lost - ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "A lead has been marked as Lost and is awaiting your approval.",
    "Lead Details",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Marked Lost By: ${payload.markedBy}`,
    `Marked Lost on: ${payload.markedAt}`,
    "Reason Provided:",
    `"${payload.remark}"`,
    "",
    "Please review the request and either approve or reject the lost status.",
    payload.leadUrl ? `Review Lost Lead: ${payload.leadUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Approval Required</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          A lead has been marked as Lost and is awaiting your approval.
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead Details</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Marked Lost By</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.markedBy}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Marked Lost on</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.markedAt}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 16px 0 6px; color: #4b5563;">Reason Provided:</p>
        <p style="margin: 0; color: #111827;">"${payload.remark}"</p>
        <p style="margin: 16px 0 0; color: #4b5563;">
          Please review the request and either approve or reject the lost status.
        </p>
        ${
          payload.leadUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.leadUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Review Lost Lead
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    markedBy: payload.markedBy,
    markedAt: payload.markedAt,
    remark: payload.remark,
    leadUrl: payload.leadUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_LOST_APPROVAL_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: LEAD_LOST_APPROVAL_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: LEAD_LOST_APPROVAL_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendLeadLostApprovedEmail = async (
  payload: LeadLostApprovedEmailPayload,
): Promise<BrevoEmailResult> => {
  const defaultSubject = `Lost Lead Request Approved: ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "Your request to mark the following lead as Lost has been approved by the Admin.",
    "Lead Details",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Approved By: ${payload.approvedBy}`,
    `Approved on: ${payload.approvedAt}`,
    "Reason Provided:",
    `"${payload.remark}"`,
    "",
    "The lead has now been closed as Lost in the system.",
    payload.leadUrl ? `View Lead Details: ${payload.leadUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Lost Lead Approved</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          Your request to mark the following lead as Lost has been approved by the Admin.
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead Details</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Approved By</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.approvedBy}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Approved on</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.approvedAt}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 16px 0 6px; color: #4b5563;">Reason Provided:</p>
        <p style="margin: 0; color: #111827;">"${payload.remark}"</p>
        <p style="margin: 16px 0 0; color: #4b5563;">
          The lead has now been closed as Lost in the system.
        </p>
        ${
          payload.leadUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.leadUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Lead Details
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    approvedBy: payload.approvedBy,
    approvedAt: payload.approvedAt,
    remark: payload.remark,
    leadUrl: payload.leadUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_LOST_APPROVED_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: LEAD_LOST_APPROVED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: LEAD_LOST_APPROVED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendLeadLostRejectedEmail = async (
  payload: LeadLostRejectedEmailPayload,
): Promise<BrevoEmailResult> => {
  const defaultSubject = `Lost Lead Request Rejected: ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "Your request to mark the following lead as Lost has been reviewed and rejected by the Admin.",
    "Lead Details",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Rejected By: ${payload.rejectedBy}`,
    `Rejected on: ${payload.rejectedAt}`,
    "Admin Remark:",
    `"${payload.remark}"`,
    "",
    "Please revisit the lead and take the necessary next steps.",
    payload.leadUrl ? `Review Lead Details: ${payload.leadUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Lost Lead Request Rejected</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          Your request to mark the following lead as Lost has been reviewed and rejected by the Admin.
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead Details</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Rejected By</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.rejectedBy}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Rejected on</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.rejectedAt}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 16px 0 6px; color: #4b5563;">Admin Remark:</p>
        <p style="margin: 0; color: #111827;">"${payload.remark}"</p>
        <p style="margin: 16px 0 0; color: #4b5563;">
          Please revisit the lead and take the necessary next steps.
        </p>
        ${
          payload.leadUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.leadUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Review Lead Details
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    rejectedBy: payload.rejectedBy,
    rejectedAt: payload.rejectedAt,
    remark: payload.remark,
    leadUrl: payload.leadUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_LOST_REJECTED_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: LEAD_LOST_REJECTED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: LEAD_LOST_REJECTED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendPaymentAddedEmail = async (
  payload: PaymentAddedEmailPayload,
): Promise<BrevoEmailResult> => {
  const defaultSubject = `Payment Added for ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "Payment information has been added to the project linked with the following lead:",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Payment Amount: ${payload.amount}`,
    `Payment Type: ${payload.paymentType}`,
    `Added By: ${payload.updatedBy}`,
    "",
    "Please review the payment details and ensure the next steps are initiated accordingly.",
    payload.leadUrl ? `View Payment & Project Details: ${payload.leadUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Payment Added</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          Payment information has been added to the project linked with the following lead:
        </p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Payment Amount</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.amount}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Payment Type</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.paymentType}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Added By</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.updatedBy}</td>
            </tr>
          </table>
        </div>
        <p style="margin: 16px 0 0; color: #4b5563;">
          Please review the payment details and ensure the next steps are initiated accordingly.
        </p>
        ${
          payload.leadUrl
            ? `<p style="margin: 16px 0 0;">
                <a
                  href="${payload.leadUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Payment &amp; Project Details
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    amount: payload.amount,
    paymentType: payload.paymentType,
    updatedBy: payload.updatedBy,
    leadUrl: payload.leadUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: PAYMENT_ADDED_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: PAYMENT_ADDED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: PAYMENT_ADDED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  }

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendReadyToDispatchEmail = async (
  payload: ReadyToDispatchEmailPayload,
): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} is Ready to Dispatch`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "The production for the following project has been successfully completed and marked as Ready to Dispatch by the factory.",
    "",
    "Project Details:",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Marked Ready By: ${payload.markedBy}`,
    `Marked Ready On: ${payload.markedAt}`,
    "",
    payload.projectUrl ? `View Project Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">
          Ready to Dispatch
        </h2>

        <p style="margin: 0 0 12px; color: #111827;">
          Hello ${payload.toName ?? "there"},
        </p>

        <p style="margin: 0 0 16px; color: #4b5563;">
          The production for the following project has been successfully completed and marked as Ready to Dispatch by the factory.
        </p>

        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 6px 0; font-weight: 600;">${payload.leadCode}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 6px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Marked Ready By</td>
              <td style="padding: 6px 0; font-weight: 600;">${payload.markedBy}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Marked Ready On</td>
              <td style="padding: 6px 0; font-weight: 600;">${payload.markedAt}</td>
            </tr>
          </table>
        </div>

        ${
          payload.projectUrl
            ? `<p style="margin: 18px 0 0;">
                <a
                  href="${payload.projectUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Project Details
                </a>
              </p>`
            : ""
        }

      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    markedBy: payload.markedBy,
    markedAt: payload.markedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: READY_TO_DISPATCH_TEMPLATE_KEY,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: READY_TO_DISPATCH_TEMPLATE_KEY,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendMiscRequirementEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  assignedBy: string;
  assignedAt: string;
  requirementDescription: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Miscellaneous Requirement Raised for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "A miscellaneous requirement has been raised during installation for the following lead.",
    "",
    "Lead Details:",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Assigned By: ${payload.assignedBy}`,
    `Assigned Date: ${payload.assignedAt}`,
    "",
    "Requirement Details:",
    payload.requirementDescription,
    "",
    `View Requirement: ${payload.projectUrl}`,
  ].join("\n");

  const defaultHtml = `
  <div style="font-family: Arial, sans-serif; background:#f9fafb; padding:24px;">
    <div style="max-width:560px; margin:auto; background:#ffffff; border-radius:10px; padding:20px; border:1px solid #e5e7eb;">

      <h2 style="color:#111827;">Miscellaneous Requirement Raised</h2>

      <p>Hello ${payload.toName ?? "there"},</p>

      <p>
        A miscellaneous requirement has been raised during installation for the following lead.
      </p>

      <table style="width:100%; font-size:14px; margin:12px 0;">
        <tr><td>Lead Code</td><td><b>${payload.leadCode}</b></td></tr>
        <tr><td>Lead Name</td><td><b>${payload.leadName}</b></td></tr>
        <tr><td>Assigned By</td><td><b>${payload.assignedBy}</b></td></tr>
        <tr><td>Assigned Date</td><td><b>${payload.assignedAt}</b></td></tr>
      </table>

      <div style="background:#f8fafc; padding:12px; border-radius:6px; margin-bottom:14px;">
        <b>Requirement Details</b>
        <p>${payload.requirementDescription}</p>
      </div>

      <a href="${payload.projectUrl}"
         target="_blank"
         style="background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
         View Requirement
      </a>

    </div>
  </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    assignedBy: payload.assignedBy,
    assignedAt: payload.assignedAt,
    requirementDescription: payload.requirementDescription,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: MISC_REQUIREMENT_TEMPLATE_KEY,
      active: true,
    },
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendMiscERDUpdatedEmail = async (
  payload: MiscERDUpdatedEmailPayload,
): Promise<BrevoEmailResult> => {
  const defaultSubject = `Miscellaneous Fulfillment Date Updated for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "The factory has updated the fulfillment date for a miscellaneous requirement related to the following lead:",
    "",
    "Lead Details:",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Expected Fulfillment Date: ${payload.fulfillmentDate}`,
    "",
    "You will be notified once the requirement is marked ready.",
    "",
    payload.projectUrl ? `View Requirement: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Miscellaneous Fulfillment Date Updated</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The factory has updated the fulfillment date for a miscellaneous requirement related to the following lead:</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280;">Lead Code</td><td style="padding: 6px 0; font-weight: 600;">${payload.leadCode}</td></tr><tr><td style="padding: 6px 0; color: #6b7280;">Lead Name</td><td style="padding: 6px 0; font-weight: 600;">${payload.leadName}</td></tr><tr><td style="padding: 6px 0; color: #6b7280;">Expected Fulfillment Date</td><td style="padding: 6px 0; font-weight: 600;">${payload.fulfillmentDate}</td></tr></table></div><p style="margin: 16px 0 0; color: #4b5563; font-size: 14px;">You will be notified once the requirement is marked ready.</p>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Requirement</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    fulfillmentDate: payload.fulfillmentDate,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: MISC_ERD_UPDATED_TEMPLATE_KEY,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: MISC_ERD_UPDATED_TEMPLATE_KEY,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendMarkAsReadyEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  readyAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Miscellaneous Requirement Ready for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "The factory has fulfilled and marked the miscellaneous requirement as Ready for the following lead:",
    "",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Marked Ready on: ${payload.readyAt}`,
    "",
    "You may now verify the delivery and mark the requirement as resolved.",
    "",
    payload.projectUrl ? `View Requirement: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">

        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">
          Miscellaneous Requirement Ready
        </h2>

        <p style="margin: 0 0 12px; color: #111827;">
          Hello ${payload.toName ?? "there"},
        </p>

        <p style="margin: 0 0 16px; color: #4b5563;">
          The factory has fulfilled and marked the miscellaneous requirement as Ready for the following lead:
        </p>

        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 6px 0; font-weight: 600;">
                ${payload.leadCode}
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 6px 0; font-weight: 600;">
                ${payload.leadName}
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Marked Ready On</td>
              <td style="padding: 6px 0; font-weight: 600;">
                ${payload.readyAt}
              </td>
            </tr>
          </table>
        </div>

        <p style="margin: 16px 0 0; color: #4b5563;">
          You may now verify the delivery and mark the requirement as resolved.
        </p>

        ${
          payload.projectUrl
            ? `<p style="margin: 18px 0 0;">
                <a
                  href="${payload.projectUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Requirement
                </a>
              </p>`
            : ""
        }

      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    readyAt: payload.readyAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: MISC_READY_TEMPLATE_KEY,
      active: true,
    },
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendMiscResolvedEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  resolvedBy: string;
  resolvedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Miscellaneous Requirement Resolved for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "The miscellaneous requirement raised for the following lead has been marked as Resolved.",
    "",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Resolved By: ${payload.resolvedBy}`,
    `Resolved On: ${payload.resolvedAt}`,
    "",
    "Installation activities can proceed as planned.",
    "",
    payload.projectUrl ? `View Lead Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">

        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">
          Miscellaneous Requirement Resolved
        </h2>

        <p style="margin: 0 0 12px; color: #111827;">
          Hello ${payload.toName ?? "there"},
        </p>

        <p style="margin: 0 0 16px; color: #4b5563;">
          The miscellaneous requirement raised for the following lead has been marked as Resolved.
        </p>

        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 6px 0; font-weight: 600;">
                ${payload.leadCode}
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 6px 0; font-weight: 600;">
                ${payload.leadName}
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Resolved By</td>
              <td style="padding: 6px 0; font-weight: 600;">
                ${payload.resolvedBy}
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Resolved On</td>
              <td style="padding: 6px 0; font-weight: 600;">
                ${payload.resolvedAt}
              </td>
            </tr>
          </table>
        </div>

        <p style="margin: 16px 0 0; color: #4b5563;">
          Installation activities can proceed as planned.
        </p>

        ${
          payload.projectUrl
            ? `<p style="margin: 18px 0 0;">
                <a
                  href="${payload.projectUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Lead Details
                </a>
              </p>`
            : ""
        }

      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    resolvedBy: payload.resolvedBy,
    resolvedAt: payload.resolvedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: MISC_RESOLVED_TEMPLATE_KEY,
      active: true,
    },
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendFinalHandoverEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Final Handover Initiated for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The lead ${payload.leadCode} - ${payload.leadName} has now entered the Final Handover stage.`,
    "",
    "Final documentation upload is in progress.",
    "",
    payload.projectUrl ? `View Lead Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">

        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">
          Final Handover Initiated
        </h2>

        <p style="margin: 0 0 12px; color: #111827;">
          Hello ${payload.toName ?? "there"},
        </p>

        <p style="margin: 0 0 16px; color: #4b5563;">
          The following lead has now entered the Final Handover stage.
        </p>

        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Lead Code</td>
              <td style="padding: 6px 0; font-weight: 600;">
                ${payload.leadCode}
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 6px 0; font-weight: 600;">
                ${payload.leadName}
              </td>
            </tr>
          </table>
        </div>

        <p style="margin: 16px 0 0; color: #4b5563;">
          Final documentation upload is in progress.
        </p>

        ${
          payload.projectUrl
            ? `<p style="margin: 18px 0 0;">
                <a
                  href="${payload.projectUrl}"
                  style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Lead Details
                </a>
              </p>`
            : ""
        }

      </div>
    </div>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: FINAL_HANDOVER_TEMPLATE_KEY,
      active: true,
    },
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendProjectCompletedEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} Project Completed Successfully`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The project associated with ${payload.leadCode} - ${payload.leadName} has been successfully completed.`,
    "",
    "Final handover documents have been uploaded and the project is now closed.",
    "",
    payload.projectUrl ? `View Project Summary: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Project Completed</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The following project has been successfully completed.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Code</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadCode}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Name</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadName}</td></tr></table></div><p style="margin: 16px 0 0; color: #4b5563;">Final handover documents have been uploaded and the project is now closed.</p>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Project Summary</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: PROJECT_COMPLETED_TEMPLATE_KEY,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: PROJECT_COMPLETED_TEMPLATE_KEY,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendTechCheckApprovedEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  approvedBy: string;
  approvedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Tech Check Approved for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "The documents submitted for the following lead have been approved by the Tech Check team.",
    "",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Approved By: ${payload.approvedBy}`,
    `Approval Date: ${payload.approvedAt}`,
    "",
    "You can now proceed with the next steps.",
    "",
    payload.projectUrl ? `View Lead Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Tech Check Approved</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The documents submitted for the following lead have been approved by the Tech Check team.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280;">Lead Code</td><td style="padding: 6px 0; font-weight: 600;">${payload.leadCode}</td></tr><tr><td style="padding: 6px 0; color: #6b7280;">Lead Name</td><td style="padding: 6px 0; font-weight: 600;">${payload.leadName}</td></tr><tr><td style="padding: 6px 0; color: #6b7280;">Approved By</td><td style="padding: 6px 0; font-weight: 600;">${payload.approvedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280;">Approval Date</td><td style="padding: 6px 0; font-weight: 600;">${payload.approvedAt}</td></tr></table></div><p style="margin: 16px 0 0; color: #4b5563;">You can now proceed with the next steps.</p>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Lead Details</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    approvedBy: payload.approvedBy,
    approvedAt: payload.approvedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: TECH_CHECK_APPROVED_TEMPLATE_KEY,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: TECH_CHECK_APPROVED_TEMPLATE_KEY,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendTechCheckRejectedEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  rejectedBy: string;
  rejectedAt: string;
  remark?: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Tech Check Rejected for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "The documents submitted for the following lead have been rejected by the Tech Check team.",
    "",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Rejected By: ${payload.rejectedBy}`,
    `Rejected Date: ${payload.rejectedAt}`,
    `Remark: ${payload.remark ?? "—"}`,
    "",
    "Please review the remark and resubmit the documents.",
    "",
    payload.projectUrl ? `View Lead Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Tech Check Rejected</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The documents submitted for the following lead have been rejected by the Tech Check team.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Code</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadCode}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Name</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadName}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Rejected By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.rejectedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Rejected Date</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.rejectedAt}</td></tr></table></div>${payload.remark ? `<div style="margin-top: 16px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><p style="margin: 0 0 6px; color: #6b7280; font-size: 13px; font-weight: 500;">Remark:</p><p style="margin: 0; color: #111827; font-size: 14px; line-height: 1.6; word-wrap: break-word; word-break: break-word; white-space: pre-wrap;">${payload.remark}</p></div>` : ""}<p style="margin: 16px 0 0; color: #4b5563;">Please review the remark and resubmit the documents.</p>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Lead Details</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    rejectedBy: payload.rejectedBy,
    rejectedAt: payload.rejectedAt,
    remark: payload.remark ?? "—",
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: TECH_CHECK_REJECTED_TEMPLATE_KEY,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: TECH_CHECK_REJECTED_TEMPLATE_KEY,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendRevisedDocumentsUploadedEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  uploadedBy: string;
  uploadedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Revised Documents Submitted for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "Revised documents have been uploaded by the Sales Executive for the following lead:",
    "",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Uploaded By: ${payload.uploadedBy}`,
    `Uploaded On: ${payload.uploadedAt}`,
    "",
    "Please re-evaluate the documents and update your Tech Check status.",
    "",
    payload.projectUrl ? `Review Revised Documents: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Revised Documents Uploaded </h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">Revised documents have been uploaded by the Sales Executive for the following lead:</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Code</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadCode}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Name</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadName}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Uploaded By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.uploadedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Uploaded On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.uploadedAt}</td></tr></table></div><p style="margin: 16px 0 0; color: #4b5563;">Please re-evaluate the documents and update your Tech Check status.</p>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">Review Revised Documents</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    uploadedBy: payload.uploadedBy,
    uploadedAt: payload.uploadedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: REVISED_DOCUMENTS_UPLOADED_TEMPLATE_KEY,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: REVISED_DOCUMENTS_UPLOADED_TEMPLATE_KEY,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendOrderLoginEnabledEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  approvedBy: string;
  approvedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Order Login Enabled for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "All required documents for the following lead have been successfully approved.",
    "",
    "Lead Details:",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Approved By: ${payload.approvedBy}`,
    `Approval Date: ${payload.approvedAt}`,
    "",
    "The Order Login option is now enabled. You may proceed to move the project to the next stage.",
    "",
    payload.projectUrl ? `View Lead Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Order Login Enabled</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">All required documents for the following lead have been successfully approved.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Code</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadCode}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Name</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadName}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Approved By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.approvedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Approval Date</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.approvedAt}</td></tr></table></div><p style="margin: 16px 0 0; color: #4b5563;">The Order Login option is now enabled. You may proceed to move the project to the next stage.</p>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Lead Details</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    approvedBy: payload.approvedBy,
    approvedAt: payload.approvedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_ENABLED_TEMPLATE_KEY,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: ORDER_LOGIN_ENABLED_TEMPLATE_KEY,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

export const sendOrderLoginAssignedEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  assignedBy: string;
  assignedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Order Login Assigned for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "You have been assigned a project for Order Login processing.",
    "",
    "Project Details:",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Assigned By: ${payload.assignedBy}`,
    `Assigned Date: ${payload.assignedAt}`,
    "",
    "Next Actions Required:",
    "• Upload Production Files (mandatory)",
    "• Fill Order Login details (file breakup, vendor/factory selection)",
    "• Upload PO files (if applicable)",
    "",
    "You may move the project to Production after uploading production files. However, Order Login details must be completed for Production to proceed smoothly.",
    "",
    payload.projectUrl ? `Go to Order Login: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Project Assigned – Order Login</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">You have been assigned a project for Order Login processing.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc; margin-bottom: 16px;"><p style="margin: 0 0 8px; font-weight: 600; font-size: 14px; color: #111827;">Project Details</p><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Code</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadCode}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Name</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadName}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Assigned By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.assignedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Assigned Date</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.assignedAt}</td></tr></table></div><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><p style="margin: 0 0 8px; font-weight: 600; font-size: 14px; color: #111827;">Next Actions Required</p><ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.6;"><li style="margin-bottom: 4px;">Upload Production Files (mandatory)</li><li style="margin-bottom: 4px;">Fill Order Login details (file breakup, vendor/factory selection)</li><li style="margin-bottom: 0;">Upload PO files (if applicable)</li></ul></div><p style="margin: 16px 0 0; color: #4b5563; font-size: 14px; line-height: 1.5;">You may move the project to Production after uploading production files. However, Order Login details must be completed for Production to proceed smoothly.</p>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">Go to Order Login</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    assignedBy: payload.assignedBy,
    assignedAt: payload.assignedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_ASSIGNED_TEMPLATE_KEY,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: ORDER_LOGIN_ASSIGNED_TEMPLATE_KEY,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 1. LEAD MOVED TO ISM STAGE
// ================================================================================
export const sendLeadMovedToISMEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} moved to ISM Stage`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The lead ${payload.leadCode} - ${payload.leadName} has progressed to the ISM stage.`,
    "",
    `Updated By: ${payload.updatedBy}`,
    `Updated On: ${payload.updatedAt}`,
    "",
    payload.projectUrl ? `View Lead Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Lead Moved to ISM</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The lead ${payload.leadCode} - ${payload.leadName} has progressed to the ISM stage.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Lead Details</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    updatedBy: payload.updatedBy,
    updatedAt: payload.updatedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.ISM_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.ISM_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 2. LEAD MOVED TO DESIGNING STAGE
// ================================================================================
export const sendLeadMovedToDesigningEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} entered the Designing stage`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The lead ${payload.leadCode} - ${payload.leadName} has entered the Designing stage.`,
    "",
    `Updated By: ${payload.updatedBy}`,
    `Updated On: ${payload.updatedAt}`,
    "",
    payload.projectUrl ? `View Lead Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Designing Stage Started</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The lead ${payload.leadCode} - ${payload.leadName} has entered the Designing stage.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Lead Details</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    updatedBy: payload.updatedBy,
    updatedAt: payload.updatedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.DESIGNING_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.DESIGNING_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 3. LEAD MOVED TO BOOKING STAGE
// ================================================================================
export const sendLeadMovedToBookingEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Booking Done for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The booking has been completed for ${payload.leadCode} - ${payload.leadName}.`,
    "",
    `Booking Done By: ${payload.updatedBy}`,
    `Booking Done On: ${payload.updatedAt}`,
    "",
    payload.projectUrl ? `View Lead Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Booking Done</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The booking has been completed for ${payload.leadCode} - ${payload.leadName}.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Booking Done By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Booking Done On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Lead Details</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    updatedBy: payload.updatedBy,
    updatedAt: payload.updatedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.BOOKING_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.BOOKING_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 4. LEAD MOVED TO CLIENT DOCUMENTATION STAGE
// ================================================================================
export const sendLeadMovedToClientDocumentationEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} entered the Client Documentation stage`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The lead ${payload.leadCode} - ${payload.leadName} has moved to the Client Documentation stage.`,
    "",
    `Updated By: ${payload.updatedBy}`,
    `Updated On: ${payload.updatedAt}`,
    "",
    payload.projectUrl ? `View Lead Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Client Documentation</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The lead ${payload.leadCode} - ${payload.leadName} has moved to the Client Documentation stage.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Lead Details</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    updatedBy: payload.updatedBy,
    updatedAt: payload.updatedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.CLIENT_DOCUMENTATION_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.CLIENT_DOCUMENTATION_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 5. LEAD MOVED TO CLIENT APPROVAL STAGE
// ================================================================================
export const sendLeadMovedToClientApprovalEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} awaiting client approval`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The lead ${payload.leadCode} - ${payload.leadName} has entered the Client Approval stage.`,
    "",
    `Updated By: ${payload.updatedBy}`,
    `Updated On: ${payload.updatedAt}`,
    "",
    payload.projectUrl ? `View Lead Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Client Approval</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The lead ${payload.leadCode} - ${payload.leadName} has entered the Client Approval stage.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Lead Details</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    updatedBy: payload.updatedBy,
    updatedAt: payload.updatedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.CLIENT_APPROVAL_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.CLIENT_APPROVAL_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 6. LEAD MOVED TO ORDER LOGIN STAGE
// ================================================================================
export const sendLeadMovedToOrderLoginEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} moved to Order Login stage`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The project ${payload.leadCode} - ${payload.leadName} has moved to the Order Login stage.`,
    "",
    `Updated By: ${payload.updatedBy}`,
    `Updated On: ${payload.updatedAt}`,
    "",
    payload.projectUrl ? `View Order Login: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Order Login Stage</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The project ${payload.leadCode} - ${payload.leadName} has moved to the Order Login stage.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Order Login</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    updatedBy: payload.updatedBy,
    updatedAt: payload.updatedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.ORDER_LOGIN_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.ORDER_LOGIN_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 7. LEAD MOVED TO PRODUCTION STAGE
// ================================================================================
export const sendLeadMovedToProductionEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} is now in Production`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The project ${payload.leadCode} - ${payload.leadName} has entered the Production stage.`,
    "",
    `Updated By: ${payload.updatedBy}`,
    `Updated On: ${payload.updatedAt}`,
    "",
    payload.projectUrl ? `View Production Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Production Started</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The project ${payload.leadCode} - ${payload.leadName} has entered the Production stage.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Production Details</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    updatedBy: payload.updatedBy,
    updatedAt: payload.updatedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.PRODUCTION_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.PRODUCTION_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 8. LEAD MOVED TO READY TO DISPATCH STAGE
// ================================================================================
export const sendLeadMovedToReadyToDispatchEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  markedBy: string;
  markedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} marked Ready to Dispatch`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The project ${payload.leadCode} - ${payload.leadName} has been marked Ready to Dispatch.`,
    "",
    `Marked By: ${payload.markedBy}`,
    `Marked On: ${payload.markedAt}`,
    "",
    payload.projectUrl ? `View Dispatch Status: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Ready to Dispatch</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The project ${payload.leadCode} - ${payload.leadName} has been marked Ready to Dispatch.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Marked By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.markedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Marked On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.markedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Dispatch Status</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    markedBy: payload.markedBy,
    markedAt: payload.markedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.READY_TO_DISPATCH_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.READY_TO_DISPATCH_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 9. LEAD MOVED TO DISPATCH PLANNING STAGE
// ================================================================================
export const sendLeadMovedToDispatchPlanningEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  movedBy: string;
  movedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} moved to Dispatch planning`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `Dispatch planning can be done for ${payload.leadCode} - ${payload.leadName}.`,
    "",
    `Moved By: ${payload.movedBy}`,
    `Moved On: ${payload.movedAt}`,
    "",
    payload.projectUrl ? `View Dispatch Plan: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Dispatch Planning</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">Dispatch planning can be done for ${payload.leadCode} - ${payload.leadName}.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Moved By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.movedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Moved On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.movedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Dispatch Plan</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    movedBy: payload.movedBy,
    movedAt: payload.movedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.DISPATCH_PLANNING_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.DISPATCH_PLANNING_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 10. LEAD MOVED TO DISPATCH STAGE
// ================================================================================
export const sendLeadMovedToDispatchEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  movedBy: string;
  movedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} moved for Dispatch`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `${payload.leadCode} - ${payload.leadName} moved for Dispatch.`,
    "",
    `Moved By: ${payload.movedBy}`,
    `Moved On: ${payload.movedAt}`,
    "",
    payload.projectUrl ? `View Dispatch: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Dispatch</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">${payload.leadCode} - ${payload.leadName} moved for Dispatch.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Moved By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.movedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Moved On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.movedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Dispatch</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    movedBy: payload.movedBy,
    movedAt: payload.movedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.DISPATCH_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.DISPATCH_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 11. LEAD MOVED TO UNDER INSTALLATION STAGE
// ================================================================================
export const sendLeadMovedToUnderInstallationEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  dispatchedBy: string;
  dispatchedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} has been moved to Under Installation`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The project ${payload.leadCode} - ${payload.leadName} has been Dispatched and moved to Under Installation.`,
    "",
    `Dispatched By: ${payload.dispatchedBy}`,
    `Dispatched On: ${payload.dispatchedAt}`,
    "",
    payload.projectUrl
      ? `View Under Installation Details: ${payload.projectUrl}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Under Installation</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The project ${payload.leadCode} - ${payload.leadName} has been Dispatched and moved to Under Installation.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Dispatched By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.dispatchedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Dispatched On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.dispatchedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Under Installation Details</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    dispatchedBy: payload.dispatchedBy,
    dispatchedAt: payload.dispatchedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.UNDER_INSTALLATION_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.UNDER_INSTALLATION_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};

// ================================================================================
// 12. LEAD MOVED TO FINAL HANDOVER STAGE
// ================================================================================
export const sendLeadMovedToFinalHandoverEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} has entered the Final Handover stage`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The project ${payload.leadCode} - ${payload.leadName} has entered the Final Handover stage.`,
    "",
    `Updated By: ${payload.updatedBy}`,
    `Updated On: ${payload.updatedAt}`,
    "",
    payload.projectUrl ? `View Handover Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Final Handover</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The project ${payload.leadCode} - ${payload.leadName} has entered the Final Handover stage.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Handover Details</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    updatedBy: payload.updatedBy,
    updatedAt: payload.updatedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: LEAD_STAGE_TEMPLATE_KEYS.FINAL_HANDOVER_STAGE,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: LEAD_STAGE_TEMPLATE_KEYS.FINAL_HANDOVER_STAGE,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;
  const text = template
    ? renderTemplate(template.text, templateValues)
    : defaultText;
  const html = template
    ? renderTemplate(template.html, templateValues)
    : defaultHtml;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};
