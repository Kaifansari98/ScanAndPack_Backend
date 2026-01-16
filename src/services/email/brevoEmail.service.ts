"use strict";

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
  toEmail: string;
  toName?: string | null;
  taskTitle: string;
  leadName: string;
  assignedBy: string;
  dueDate: string;
  taskUrl?: string;
};

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

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
  const subject = `New Lead Created: ${payload.leadCode} - ${payload.leadName}`;
  const text = [
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

  const html = `
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
  const subject = `New Lead Assigned to You: ${payload.leadCode} - ${payload.leadName}`;
  const text = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "A new lead has been assigned to you by the admin.",
    "Lead Summary",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Contact Details: ${payload.contact}`,
    `Furniture Type: ${payload.furnitureType}`,
    `Furniture Structure: ${payload.furnitureStructure}`,
    `Created Date: ${payload.createdDate}`,
    "",
    "Please connect with the client and initiate the sales process.",
    payload.leadUrl ? `View Assigned Lead: ${payload.leadUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Lead Assigned</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          A new lead has been assigned to you by the admin.
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
                  View Assigned Lead
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

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
  const subject = `Lead Assigned to Site Supervisor: ${payload.leadCode} - ${payload.leadName}`;
  const text = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "You have been assigned a lead as the site supervisor.",
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

  const html = `
    <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Lead Assigned to Site Supervisor</h2>
        <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
        <p style="margin: 0 0 16px; color: #4b5563;">
          You have been assigned a lead as the site supervisor.
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
  const subject = `New Task Assigned: ${payload.taskTitle}`;
  const text = [
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
    payload.taskUrl ? `View Task & Lead: ${payload.taskUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
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
                  View Task &amp; Lead
                </a>
              </p>`
            : ""
        }
      </div>
    </div>
  `;

  return sendBrevoEmail({
    toEmail: payload.toEmail,
    toName: payload.toName,
    subject,
    text,
    html,
  });
};
