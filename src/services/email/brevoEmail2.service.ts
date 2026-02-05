import { prisma } from "../../../src/prisma/client";
import { BrevoEmailResult, sendBrevoEmail } from "./brevoEmail.service";
import logger from "src/utils/logger";

// Template Keys Constants
export const ORDER_LOGIN_TEMPLATE_KEYS = {
  MOVED_WITHOUT_ORDER_LOGIN: "MOVED_TO_PRODUCTION_WITHOUT_ORDER_LOGIN_FOR_BACKEND",
  ORDER_LOGIN_REMINDER: "REMINDER_FOR_ORDER_LOGIN",
  ORDER_LOGIN_COMPLETED: "ORDER_LOGIN_DETAILS_INPUT",
  MOVED_TO_PRODUCTION_ORDER_LOGIN_PENDING:
    "MOVED_TO_PRODUCTION_ORDER_LOGIN_PENDING",
  MOVED_TO_PRODUCTION_WITH_ORDER_LOGIN: "MOVED_TO_PRODUCTION_WITH_ORDER_LOGIN",
  UNDER_INSTALLATION_ASSIGNED_TEMPLATE_KEY: "MOVE_TO_UNDERINSTALLATION",
  LEAD_MOVED_TO_DISPATCH_TEMPLATE_KEY: "MOVE_TO_DISPATCH",
};

const renderTemplate = (template: string, values: Record<string, string>) => {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : match;
  });
};

export const sendMovedToProductionWithoutOrderLoginEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Action Required: Complete Order Login Details for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The project ${payload.leadCode} - ${payload.leadName} has been moved to the Production stage.`,
    "",
    "While production can begin, the Order Login details are still pending.",
    "",
    "Pending Information:",
    "• Production file breakup",
    "• Vendor / Factory selection",
    "• PO upload (if applicable)",
    "",
    "⚠️ Order Login completion is mandatory for the Production team to update schedules and timelines.",
    "",
    "Please complete this at the earliest to avoid downstream delays.",
    "",
    payload.projectUrl ? `Complete Order Login: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Order Login Pending</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The project ${payload.leadCode} - ${payload.leadName} has been moved to the Production stage.</p><p style="margin: 0 0 16px; color: #4b5563;">While production can begin, the Order Login details are still pending.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><p style="margin: 0 0 8px; font-weight: 600; font-size: 14px; color: #111827;">Pending Information</p><ul style="margin: 0; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.6;"><li style="margin-bottom: 4px;">Production file breakup</li><li style="margin-bottom: 4px;">Vendor / Factory selection</li><li style="margin-bottom: 0;">PO upload (if applicable)</li></ul></div><p style="margin: 16px 0 0; color: #4b5563; font-size: 14px; line-height: 1.5;">⚠️ Order Login completion is mandatory for the Production team to update schedules and timelines.</p><p style="margin: 8px 0 0; color: #4b5563; font-size: 14px;">Please complete this at the earliest to avoid downstream delays.</p>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">Complete Order Login</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.MOVED_WITHOUT_ORDER_LOGIN,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: ORDER_LOGIN_TEMPLATE_KEYS.MOVED_WITHOUT_ORDER_LOGIN,
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

export const sendOrderLoginReminderEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Reminder: Order Login Pending for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "This is a reminder that Order Login details are still pending for the following project:",
    "",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    "",
    "While production may be in progress, incomplete Order Login information can delay:",
    "• Production timelines",
    "• Vendor coordination",
    "• Schedule tracking",
    "",
    "Please update the Order Login details at the earliest.",
    "",
    payload.projectUrl ? `Complete Order Login: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Reminder: Order Login Pending</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">This is a reminder that Order Login details are still pending for the following project:</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc; margin-bottom: 16px;"><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Code</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadCode}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Name</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadName}</td></tr></table></div><p style="margin: 0 0 8px; color: #4b5563; font-size: 14px;">While production may be in progress, incomplete Order Login information can delay:</p><ul style="margin: 0 0 16px; padding-left: 20px; color: #4b5563; font-size: 14px; line-height: 1.6;"><li style="margin-bottom: 4px;">Production timelines</li><li style="margin-bottom: 4px;">Vendor coordination</li><li style="margin-bottom: 0;">Schedule tracking</li></ul><p style="margin: 0; color: #4b5563; font-size: 14px;">Please update the Order Login details at the earliest.</p>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">Complete Order Login</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.ORDER_LOGIN_REMINDER,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: ORDER_LOGIN_TEMPLATE_KEYS.ORDER_LOGIN_REMINDER,
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

export const sendOrderLoginCompletedEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Order Login Completed – Production Ready for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "The Order Login details for the following project have been completed.",
    "",
    "Project Details:",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Updated By: ${payload.updatedBy}`,
    `Updated On: ${payload.updatedAt}`,
    "",
    "You may now proceed with production planning and update schedules accordingly.",
    "",
    payload.projectUrl ? `View Production Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Order Login Completed</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">The Order Login details for the following project have been completed.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><p style="margin: 0 0 8px; font-weight: 600; font-size: 14px; color: #111827;">Project Details</p><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Code</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadCode}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Lead Name</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.leadName}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 35%; vertical-align: top;">Updated On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.updatedAt}</td></tr></table></div><p style="margin: 16px 0 0; color: #4b5563;">You may now proceed with production planning and update schedules accordingly.</p>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Production Details</a></p>` : ""}</div></div>`;

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
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.ORDER_LOGIN_COMPLETED,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: ORDER_LOGIN_TEMPLATE_KEYS.ORDER_LOGIN_COMPLETED,
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

export const sendMovedToProductionOrderLoginPendingEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `Moved to Production with Partial Details for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The project ${payload.leadCode} - ${payload.leadName} has been moved to the Production stage.`,
    "",
    "What’s Available:",
    "✅ Production files have been uploaded",
    "❌ Order Login details are not yet completed",
    "",
    "You may begin preliminary production activities using the available files.",
    "However, vendor allocation, file breakup and PO details are still pending and will be updated by the Backend team shortly.",
    "",
    "Please note that final scheduling and commitments should be aligned once Order Login details are completed.",
    "",
    payload.projectUrl ? `View Production Files: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
    
    <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">
      Moved to Production (Order Login Pending)
    </h2>

    <p style="margin: 0 0 12px; color: #111827;">
      Hello ${payload.toName ?? "there"},
    </p>

    <p style="margin: 0 0 16px; color: #4b5563;">
      The project <strong>${payload.leadCode} - ${payload.leadName}</strong> has been moved to the Production stage.
    </p>

    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
      <p style="margin: 0 0 8px; font-weight: 600; font-size: 14px; color: #111827;">
        What’s Available
      </p>

      <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #111827;">
        <li>✅ Production files have been uploaded</li>
        <li>❌ Order Login details are not yet completed</li>
      </ul>
    </div>

    <p style="margin: 14px 0 0; color: #4b5563;">
      You may begin preliminary production activities using the available files.
      However, vendor allocation, file breakup and PO details are still pending and will be updated by the Backend team shortly.
    </p>

    <p style="margin: 12px 0 0; color: #4b5563;">
      Please align final scheduling and commitments once Order Login details are completed.
    </p>

    ${
      payload.projectUrl
        ? `<p style="margin: 18px 0 0;">
            <a href="${payload.projectUrl}"
              style="display:inline-block; background:#111827; color:#ffffff;
              text-decoration:none; padding:10px 18px; border-radius:6px;"
              target="_blank" rel="noopener noreferrer">
              View Production Files
            </a>
          </p>`
        : ""
    }

  </div>
</div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key:
        ORDER_LOGIN_TEMPLATE_KEYS.MOVED_TO_PRODUCTION_ORDER_LOGIN_PENDING,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key:
      ORDER_LOGIN_TEMPLATE_KEYS.MOVED_TO_PRODUCTION_ORDER_LOGIN_PENDING,
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

export const sendMovedToProductionWithOrderLoginEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} moved to Production`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The project ${payload.leadCode} - ${payload.leadName} has been moved to the Production stage.`,
    "",
    `Updated By: ${payload.updatedBy}`,
    `Updated On: ${payload.updatedAt}`,
    "",
    payload.projectUrl ? `View Production Files: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff;
    border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">

    <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">
      Moved to Production
    </h2>

    <p style="margin: 0 0 12px; color: #111827;">
      Hello ${payload.toName ?? "there"},
    </p>

    <p style="margin: 0 0 16px; color: #4b5563;">
      The project <strong>${payload.leadCode} - ${payload.leadName}</strong>
      has been moved to the Production stage.
    </p>

    <div style="border: 1px solid #e5e7eb; border-radius: 8px;
      padding: 12px; background: #f8fafc; font-size: 14px;">

      <table style="width:100%; border-collapse: collapse;">
        <tr>
          <td style="padding:6px 0; color:#6b7280; width:35%;">Updated By</td>
          <td style="padding:6px 0; font-weight:600;">
            ${payload.updatedBy}
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0; color:#6b7280;">Updated On</td>
          <td style="padding:6px 0; font-weight:600;">
            ${payload.updatedAt}
          </td>
        </tr>
      </table>
    </div>

    ${
      payload.projectUrl
        ? `<p style="margin: 18px 0 0;">
            <a href="${payload.projectUrl}"
              style="display:inline-block;
              background:#111827;
              color:#ffffff;
              text-decoration:none;
              padding:10px 18px;
              border-radius:6px;"
              target="_blank" rel="noopener noreferrer">
              👉 View Production Files
            </a>
          </p>`
        : ""
    }

  </div>
</div>`;

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
      template_key:
        ORDER_LOGIN_TEMPLATE_KEYS.MOVED_TO_PRODUCTION_WITH_ORDER_LOGIN,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key:
      ORDER_LOGIN_TEMPLATE_KEYS.MOVED_TO_PRODUCTION_WITH_ORDER_LOGIN,
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

export const sendUnderInstallationAssignedEmail = async (payload: {
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
      template_key:
        ORDER_LOGIN_TEMPLATE_KEYS.UNDER_INSTALLATION_ASSIGNED_TEMPLATE_KEY,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key:
      ORDER_LOGIN_TEMPLATE_KEYS.UNDER_INSTALLATION_ASSIGNED_TEMPLATE_KEY,
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

export const sendLeadMovedToDispatchEmail = async (payload: {
  vendor_id: number;
  toEmail: string;
  toName?: string;

  leadCode: string;
  leadName: string;

  onsiteContactName: string;
  onsiteContactNumber: string;
  requiredDeliveryDate: string;
  liftAvailability: string;

  movedBy: string;
  movedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} moved to Dispatch Stage`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `Dispatch Planning information has been added for ${payload.leadCode} - ${payload.leadName} and moved to the Dispatch stage.`,
    "",
    "Dispatch Planning Information as below:",
    `Onsite Contact Person Name: ${payload.onsiteContactName}`,
    `Onsite Contact Person Number: ${payload.onsiteContactNumber}`,
    `Required OnSite Delivery Date: ${payload.requiredDeliveryDate}`,
    `Lift Availability: ${payload.liftAvailability}`,
    `Moved By: ${payload.movedBy}`,
    `Moved On: ${payload.movedAt}`,
    "",
    payload.projectUrl ? `View Dispatch: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;"><div style="max-width: 540px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;"><h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Lead Moved to Dispatch</h2><p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p><p style="margin: 0 0 16px; color: #4b5563;">Dispatch Planning information has been added for ${payload.leadCode} - ${payload.leadName} and moved to the Dispatch stage.</p><div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;"><p style="margin: 0 0 8px; font-weight: 600; font-size: 14px; color: #111827;">Dispatch Planning Information</p><table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #111827;"><tr><td style="padding: 6px 0; color: #6b7280; width: 40%; vertical-align: top;">Onsite Contact Person Name</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.onsiteContactName}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 40%; vertical-align: top;">Onsite Contact Person Number</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.onsiteContactNumber}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 40%; vertical-align: top;">Required OnSite Delivery Date</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.requiredDeliveryDate}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 40%; vertical-align: top;">Lift Availability</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.liftAvailability}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 40%; vertical-align: top;">Moved By</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.movedBy}</td></tr><tr><td style="padding: 6px 0; color: #6b7280; width: 40%; vertical-align: top;">Moved On</td><td style="padding: 6px 0; font-weight: 600; word-break: break-word;">${payload.movedAt}</td></tr></table></div>${payload.projectUrl ? `<p style="margin: 18px 0 0;"><a href="${payload.projectUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px;" target="_blank" rel="noopener noreferrer">View Dispatch</a></p>` : ""}</div></div>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    onsiteContactName: payload.onsiteContactName,
    onsiteContactNumber: payload.onsiteContactNumber,
    requiredDeliveryDate: payload.requiredDeliveryDate,
    liftAvailability: payload.liftAvailability,
    movedBy: payload.movedBy,
    movedAt: payload.movedAt,
    projectUrl: payload.projectUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key:
        ORDER_LOGIN_TEMPLATE_KEYS.LEAD_MOVED_TO_DISPATCH_TEMPLATE_KEY,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: ORDER_LOGIN_TEMPLATE_KEYS.LEAD_MOVED_TO_DISPATCH_TEMPLATE_KEY,
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
