"use strict";

import { prisma } from "../../prisma/client";
import logger from "../../utils/logger";

export type BrevoEmailPayload = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string;
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

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const LEAD_CREATED_TEMPLATE_KEY = "LEAD_CREATED";
const LEAD_ASSIGNED_TEMPLATE_KEY = "LEAD_ASSIGNED";
const LEAD_ASSIGNED_SITE_SUPERVISOR_TEMPLATE_KEY = "LEAD_ASSIGNED_SITE_SUPERVISOR";
const TASK_ASSIGNED_TEMPLATE_KEY = "TASK_ASSIGNED";
const CHAT_MENTION_TEMPLATE_KEY = "CHAT_MENTION";
const MILESTONE_TEMPLATE_KEY = "MILESTONE_ACHIEVED";


const renderTemplate = (template: string, values: Record<string, string>) => {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : match;
  });
};

export const sendBrevoEmail = async (
  payload: BrevoEmailPayload
): Promise<BrevoEmailResult> => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Furnix CRM";
  const replyTo = process.env.BREVO_REPLY_TO_EMAIL;
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
                name: senderName,
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
  payload: LeadCreatedEmailPayload
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
    "Please connect with the client and start capturing requirements.",
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

export const sendLeadAssignedEmail = async (
  payload: LeadCreatedEmailPayload
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
    "Please connect with the client and initiate the sales process.",
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
          Please connect with the client and initiate the sales process.
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
  payload: LeadCreatedEmailPayload
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
  payload: TaskAssignedEmailPayload
): Promise<BrevoEmailResult> => {
  const defaultSubject = `Task Assigned: ${payload.taskTitle} - ${payload.leadCode} ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "You have been assigned a new task in the CRM.",
    "Task Details",
    `Task: ${payload.taskTitle}`,
    `Related Lead: ${payload.leadName}`,
    `Assigned By: ${payload.assignedBy}`,
    `Due Date: ${payload.dueDate}`,
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
              <td style="padding: 4px 0; color: #6b7280;">Related Lead</td>
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
  payload: ChatMentionEmailPayload
): Promise<BrevoEmailResult> => {
  const defaultSubject = `You Were Mentioned: ${payload.leadCode} - ${payload.leadName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `You were mentioned by ${payload.senderName} in a conversation related to the following lead:`,
    `Lead: ${payload.leadName}`,
    "Message:",
    `"${payload.messageText}"`,
    "",
    "Please review the message and respond if required.",
    payload.conversationUrl ? `View Conversation: ${payload.conversationUrl}` : "",
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
  payload: MajorMilestoneEmailPayload
): Promise<BrevoEmailResult> => {
  const defaultSubject = `Milestone Achieved: ${payload.leadCode} - ${payload.milestoneName}`;
  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "A major milestone has been achieved for the following lead:",
    `Lead Name: ${payload.leadName}`,
    `Milestone: ${payload.milestoneName}`,
    `Completed On: ${payload.completedOn}`,
    "",
    "This marks an important progression in the project lifecycle. Please review the details and proceed with the next required actions.",
    payload.detailsUrl ? `View Lead / Project Details: ${payload.detailsUrl}` : "",
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
              <td style="padding: 4px 0; color: #6b7280;">Lead Name</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.leadName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Milestone</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.milestoneName}</td>
            </tr>
            <tr>
              <td style="padding: 4px 0; color: #6b7280;">Completed On</td>
              <td style="padding: 4px 0; font-weight: 600;">${payload.completedOn}</td>
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
