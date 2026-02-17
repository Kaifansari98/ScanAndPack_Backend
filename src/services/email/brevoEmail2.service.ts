import { prisma } from "../../../src/prisma/client";
import { BrevoEmailResult, sendBrevoEmail } from "./brevoEmail.service";
import logger from "../../../src/utils/logger";

// Template Keys Constants
export const ORDER_LOGIN_TEMPLATE_KEYS = {
  MOVED_WITHOUT_ORDER_LOGIN:
    "MOVED_TO_PRODUCTION_WITHOUT_ORDER_LOGIN_FOR_BACKEND",
  ORDER_LOGIN_REMINDER: "REMINDER_FOR_ORDER_LOGIN",
  ORDER_LOGIN_COMPLETED: "ORDER_LOGIN_DETAILS_INPUT",
  MOVED_TO_PRODUCTION_ORDER_LOGIN_PENDING:
    "MOVED_TO_PRODUCTION_ORDER_LOGIN_PENDING",
  MOVED_TO_PRODUCTION_WITH_ORDER_LOGIN: "MOVED_TO_PRODUCTION_WITH_ORDER_LOGIN",
  UNDER_INSTALLATION_ASSIGNED_TEMPLATE_KEY: "MOVE_TO_UNDERINSTALLATION",
  LEAD_MOVED_TO_DISPATCH_TEMPLATE_KEY: "MOVE_TO_DISPATCH",
  TECHCHECK_REJECTED_DOCUMENT_KEY: "TECH_CHECK_FILES_REJECTED_SA",
  TECHCHECK_APPROVED_DOCUMENT_KEY: "TECH_CHECK_APPROVED_SA",
};

const renderTemplate = (template: string, values: Record<string, string>) => {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : match;
  });
};

//  backend user email
// 2
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
    "The following project has been moved to the Production stage.",
    "",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    "",
    "Current Status:",
    "Production files have been uploaded",
    "Order Login details are not yet completed",
    "",
    "You may begin preliminary production activities using the available files.",
    "Vendor allocation, file breakup and PO details are still pending and will be updated shortly.",
    "",
    "Please align final scheduling and commitments once Order Login details are completed.",
    "",
    payload.projectUrl ? `View Production Files: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .lead-info-row {
      display: table;
      width: 100%;
      padding: 4px 0;
    }
    .lead-info-label {
      display: table-cell;
      width: 40%;
      color: #6b7280;
      font-size: 14px;
      vertical-align: top;
    }
    .lead-info-value {
      display: table-cell;
      width: 60%;
      color: #111827;
      font-weight: 600;
      font-size: 14px;
      word-break: break-word;
    }

    @media only screen and (max-width: 600px) {
      .lead-info-row {
        display: block !important;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 4px;
        padding-bottom: 4px;
      }
      .lead-info-row:last-child {
        border-bottom: none;
      }
      .lead-info-label,
      .lead-info-value {
        display: block;
        width: 100%;
      }
      .lead-info-label {
        font-size: 13px;
        margin-bottom: 4px;
      }
    }
  </style>
</head>

<body style="margin:0;padding:0;font-family:Arial,sans-serif;">
  <div style="background:#f9fafb;padding:10px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;">

      <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">
        Moved to Production
      </h2>

      <p style="margin:0 0 12px;color:#111827;">
        Hello ${payload.toName ?? "there"},
      </p>

      <p style="margin:0 0 16px;color:#4b5563;">
        The following project has been moved to the Production stage.
      </p>

      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc;">
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Code</div>
          <div class="lead-info-value">${payload.leadCode}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Name</div>
          <div class="lead-info-value">${payload.leadName}</div>
        </div>
      </div>

      <p style="margin:16px 0 6px;color:#111827;font-weight:600;">
        Current Status
      </p>

<p style="margin:0 0 6px;color:#4b5563;">
  <span style="color:#16a34a; font-weight:bold;">✔</span>
  &nbsp;Production files have been uploaded
</p>

<p style="margin:0;color:#4b5563;">
  <span style="color:#dc2626; font-weight:bold;">✖</span>
  &nbsp;Order Login details are not yet completed
</p>


      <p style="margin:16px 0 0;color:#4b5563;">
        You may begin preliminary production activities using the available files.
        Vendor allocation, file breakup and PO details are still pending and will be updated shortly.
      </p>

      <p style="margin:12px 0 0;color:#4b5563;">
        Please align final scheduling and commitments once Order Login details are completed.
      </p>

      ${
        payload.projectUrl
          ? `<div style="margin:16px 0 0;text-align:start;">
              <a
                href="${payload.projectUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Production Files
              </a>
            </div>`
          : ""
      }

    </div>
  </div>
</body>
</html>
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

  const subject = template?.subject?.trim()
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template?.text?.trim()
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template?.html?.trim()
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
// 3
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
    "Production file breakup",
    "Vendor / Factory selection",
    "PO upload (if applicable)",
    "",
    "Order Login completion is mandatory for the Production team to update schedules and timelines.",
    "",
    "Please complete this at the earliest to avoid downstream delays.",
    "",
    payload.projectUrl ? `Complete Order Login: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .lead-info-row {
      display: table;
      width: 100%;
      padding: 4px 0;
    }
    .lead-info-label {
      display: table-cell;
      width: 40%;
      color: #6b7280;
      font-size: 14px;
      vertical-align: top;
    }
    .lead-info-value {
      display: table-cell;
      width: 60%;
      color: #111827;
      font-weight: 600;
      font-size: 14px;
      word-break: break-word;
    }

    @media only screen and (max-width: 600px) {
      .lead-info-row {
        display: block !important;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 4px;
        padding-bottom: 4px;
      }
      .lead-info-row:last-child {
        border-bottom: none;
      }
      .lead-info-label,
      .lead-info-value {
        display: block;
        width: 100%;
      }
      .lead-info-label {
        font-size: 13px;
        margin-bottom: 4px;
      }
    }
  </style>
</head>

<body style="margin:0;padding:0;font-family:Arial,sans-serif;">
  <div style="background:#f9fafb;padding:10px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;">

      <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">
        Order Login Pending
      </h2>

      <p style="margin:0 0 12px;color:#111827;">
        Hello ${payload.toName ?? "there"},
      </p>

      <p style="margin:0 0 12px;color:#4b5563;">
        The project <strong>${payload.leadCode} - ${payload.leadName}</strong> has been moved to the Production stage.
      </p>

      <p style="margin:0 0 16px;color:#4b5563;">
        While production can begin, the Order Login details are still pending.
      </p>

      <p style="margin:0 0 6px;color:#111827;font-weight:600;">
        Pending Information
      </p>

        <ul style="margin:0; padding-left:16px;">
          <li style="margin:0 0 6px; color:#4b5563;">
            Production file breakup
          </li>
          <li style="margin:0 0 6px; color:#4b5563;">
            Vendor / Factory selection
          </li>
          <li style="margin:0; color:#4b5563;">
            PO upload (if applicable)
          </li>
        </ul>


      <p style="margin:16px 0 0;color:#4b5563;">
        Order Login completion is mandatory for the Production team to update schedules and timelines.
      </p>

      <p style="margin:8px 0 0;color:#4b5563;">
        Please complete this at the earliest to avoid downstream delays.
      </p>

      ${
        payload.projectUrl
          ? `<div style="margin:16px 0 0;text-align:start;">
              <a
                href="${payload.projectUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;"
                target="_blank"
                rel="noopener noreferrer"
              >
                Complete Order Login
              </a>
            </div>`
          : ""
      }

    </div>
  </div>
</body>
</html>
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
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.MOVED_WITHOUT_ORDER_LOGIN,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: ORDER_LOGIN_TEMPLATE_KEYS.MOVED_WITHOUT_ORDER_LOGIN,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template?.subject?.trim()
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template?.text?.trim()
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template?.html?.trim()
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
// 4
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
    "Production timelines",
    "Vendor coordination",
    "Schedule tracking",
    "",
    "Please update the Order Login details at the earliest.",
    "",
    payload.projectUrl ? `Complete Order Login: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .lead-info-row {
      display: table;
      width: 100%;
      padding: 4px 0;
    }
    .lead-info-label {
      display: table-cell;
      width: 40%;
      color: #6b7280;
      font-size: 14px;
      vertical-align: top;
    }
    .lead-info-value {
      display: table-cell;
      width: 60%;
      color: #111827;
      font-weight: 600;
      font-size: 14px;
      word-break: break-word;
    }

    @media only screen and (max-width: 600px) {
      .lead-info-row {
        display: block !important;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 4px;
        padding-bottom: 4px;
      }
      .lead-info-row:last-child {
        border-bottom: none;
      }
      .lead-info-label,
      .lead-info-value {
        display: block;
        width: 100%;
      }
      .lead-info-label {
        font-size: 13px;
        margin-bottom: 4px;
      }
           .lead-info-row.no-border {
        border-bottom: none !important;
      }
    }
  </style>
</head>

<body style="margin:0;padding:0;font-family:Arial,sans-serif;">
  <div style="background:#f9fafb;padding:10px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;">

      <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">
        Reminder: Order Login Pending
      </h2>

      <p style="margin:0 0 12px;color:#111827;">
        Hello ${payload.toName ?? "there"},
      </p>

      <p style="margin:0 0 16px;color:#4b5563;">
        This is a reminder that Order Login details are still pending for the following project:
      </p>

      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc;">
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Code</div>
          <div class="lead-info-value">${payload.leadCode}</div>
        </div>
        <div class="lead-info-row .no-border">
          <div class="lead-info-label">Lead Name</div>
          <div class="lead-info-value">${payload.leadName}</div>
        </div>
      </div>

      <p style="margin:16px 0 6px;color:#111827;font-weight:600;">
        While production may be in progress, incomplete Order Login information can delay:
      </p>

<ul style="margin:0; padding-left:16px;">
  <li style="margin:0 0 6px; color:#4b5563;">
    Production timelines
  </li>
  <li style="margin:0 0 6px; color:#4b5563;">
    Vendor coordination
  </li>
  <li style="margin:0; color:#4b5563;">
    Schedule tracking
  </li>
</ul>


      <p style="margin:16px 0 0;color:#4b5563;">
        Please update the Order Login details at the earliest.
      </p>

      ${
        payload.projectUrl
          ? `<div style="margin:16px 0 0;text-align:start;">
              <a
                href="${payload.projectUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;"
                target="_blank"
                rel="noopener noreferrer"
              >
                Complete Order Login
              </a>
            </div>`
          : ""
      }

    </div>
  </div>
</body>
</html>
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
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.ORDER_LOGIN_REMINDER,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: ORDER_LOGIN_TEMPLATE_KEYS.ORDER_LOGIN_REMINDER,
    vendor_id: payload.vendor_id,
    source: template ? "db" : "default",
  });

  const subject = template?.subject?.trim()
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template?.text?.trim()
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template?.html?.trim()
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
// 5
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

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .lead-info-row {
      display: table;
      width: 100%;
      padding: 4px 0;
    }
    .lead-info-label {
      display: table-cell;
      width: 40%;
      color: #6b7280;
      font-size: 14px;
      vertical-align: top;
    }
    .lead-info-value {
      display: table-cell;
      width: 60%;
      color: #111827;
      font-weight: 600;
      font-size: 14px;
      word-break: break-word;
    }

    @media only screen and (max-width: 600px) {
      .lead-info-row {
        display: block !important;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 4px;
        padding-bottom: 4px;
      }
      .lead-info-row:last-child {
        border-bottom: none;
      }
      .lead-info-label,
      .lead-info-value {
        display: block;
        width: 100%;
      }
      .lead-info-label {
        font-size: 13px;
        margin-bottom: 4px;
      }
    }
  </style>
</head>

<body style="margin:0;padding:0;font-family:Arial,sans-serif;">
  <div style="background:#f9fafb;padding:10px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;">

      <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">
        Order Login Completed
      </h2>

      <p style="margin:0 0 12px;color:#111827;">
        Hello ${payload.toName ?? "there"},
      </p>

      <p style="margin:0 0 16px;color:#4b5563;">
        The Order Login details for the following project have been completed.
      </p>

      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc;">
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Code</div>
          <div class="lead-info-value">${payload.leadCode}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Name</div>
          <div class="lead-info-value">${payload.leadName}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Updated By</div>
          <div class="lead-info-value">${payload.updatedBy}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Updated On</div>
          <div class="lead-info-value">${payload.updatedAt}</div>
        </div>
      </div>

      <p style="margin:16px 0 0;color:#4b5563;">
        You may now proceed with production planning and update schedules accordingly.
      </p>

      ${
        payload.projectUrl
          ? `<div style="margin:16px 0 0;text-align:start;">
              <a
                href="${payload.projectUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Production Details
              </a>
            </div>`
          : ""
      }

    </div>
  </div>
</body>
</html>
`;

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

  const subject = template?.subject?.trim()
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template?.text?.trim()
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template?.html?.trim()
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
//6
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
    "The following project has been moved to the Production stage.",
    "",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Updated By: ${payload.updatedBy}`,
    `Updated On: ${payload.updatedAt}`,
    "",
    payload.projectUrl ? `View Production Files: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .lead-info-row {
      display: table;
      width: 100%;
      padding: 4px 0;
    }
    .lead-info-label {
      display: table-cell;
      width: 40%;
      color: #6b7280;
      font-size: 14px;
      vertical-align: top;
    }
    .lead-info-value {
      display: table-cell;
      width: 60%;
      color: #111827;
      font-weight: 600;
      font-size: 14px;
      word-break: break-word;
    }

    @media only screen and (max-width: 600px) {
      .lead-info-row {
        display: block !important;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 4px;
        padding-bottom: 4px;
      }
      .lead-info-row:last-child {
        border-bottom: none;
      }
      .lead-info-label,
      .lead-info-value {
        display: block;
        width: 100%;
      }
      .lead-info-label {
        font-size: 13px;
        margin-bottom: 4px;
      }
    }
  </style>
</head>

<body style="margin:0;padding:0;font-family:Arial,sans-serif;">
  <div style="background:#f9fafb;padding:10px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;">

      <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">
        Moved to Production
      </h2>

      <p style="margin:0 0 12px;color:#111827;">
        Hello ${payload.toName ?? "there"},
      </p>

      <p style="margin:0 0 16px;color:#4b5563;">
        The following project has been moved to the Production stage.
      </p>

      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc;">
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Code</div>
          <div class="lead-info-value">${payload.leadCode}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Name</div>
          <div class="lead-info-value">${payload.leadName}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Updated By</div>
          <div class="lead-info-value">${payload.updatedBy}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Updated On</div>
          <div class="lead-info-value">${payload.updatedAt}</div>
        </div>
      </div>

      ${
        payload.projectUrl
          ? `<div style="margin:16px 0 0;text-align:start;">
              <a
                href="${payload.projectUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Production Files
              </a>
            </div>`
          : ""
      }

    </div>
  </div>
</body>
</html>
`;

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

  const subject = template?.subject?.trim()
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template?.text?.trim()
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template?.html?.trim()
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

// 9
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
  const defaultSubject = `${payload.leadCode} - ${payload.leadName} moved to Under Installation`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    `The project ${payload.leadCode} - ${payload.leadName} has been dispatched and moved to the Under Installation stage.`,
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

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .lead-info-row {
      display: table;
      width: 100%;
      padding: 4px 0;
    }
    .lead-info-label {
      display: table-cell;
      width: 40%;
      color: #6b7280;
      font-size: 14px;
      vertical-align: top;
    }
    .lead-info-value {
      display: table-cell;
      width: 60%;
      color: #111827;
      font-weight: 600;
      font-size: 14px;
      word-break: break-word;
    }

    @media only screen and (max-width: 600px) {
      .lead-info-row {
        display: block !important;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 4px;
        padding-bottom: 4px;
      }
      .lead-info-row:last-child {
        border-bottom: none;
      }
      .lead-info-label,
      .lead-info-value {
        display: block;
        width: 100%;
      }
      .lead-info-label {
        font-size: 13px;
        margin-bottom: 4px;
      }
    }
  </style>
</head>

<body style="margin:0;padding:0;font-family:Arial,sans-serif;">
  <div style="background:#f9fafb;padding:10px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;">

      <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">
        Under Installation
      </h2>

      <p style="margin:0 0 12px;color:#111827;">
        Hello ${payload.toName ?? "there"},
      </p>

      <p style="margin:0 0 16px;color:#4b5563;">
        The project ${payload.leadCode} - ${payload.leadName} has been dispatched and moved to the Under Installation stage.
      </p>

      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc;">
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Code</div>
          <div class="lead-info-value">${payload.leadCode}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Name</div>
          <div class="lead-info-value">${payload.leadName}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Dispatched By</div>
          <div class="lead-info-value">${payload.dispatchedBy}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Dispatched On</div>
          <div class="lead-info-value">${payload.dispatchedAt}</div>
        </div>
      </div>

      ${
        payload.projectUrl
          ? `<div style="margin:16px 0 0;text-align:start;">
              <a
                href="${payload.projectUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Under Installation Details
              </a>
            </div>`
          : ""
      }

    </div>
  </div>
</body>
</html>
`;

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

  const subject = template?.subject?.trim()
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template?.text?.trim()
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template?.html?.trim()
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

// factory user email
// 1
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
    "Dispatch planning information has been added and the project has been moved to the Dispatch stage.",
    "",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    "",
    "Dispatch Planning Details:",
    `Onsite Contact Name: ${payload.onsiteContactName}`,
    `Onsite Contact Number: ${payload.onsiteContactNumber}`,
    `Required Delivery Date: ${payload.requiredDeliveryDate}`,
    `Lift Availability: ${payload.liftAvailability}`,
    `Moved By: ${payload.movedBy}`,
    `Moved On: ${payload.movedAt}`,
    "",
    payload.projectUrl ? `View Dispatch Details: ${payload.projectUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .lead-info-row {
      display: table;
      width: 100%;
      padding: 4px 0;
    }
    .lead-info-label {
      display: table-cell;
      width: 40%;
      color: #6b7280;
      font-size: 14px;
      vertical-align: top;
    }
    .lead-info-value {
      display: table-cell;
      width: 60%;
      color: #111827;
      font-weight: 600;
      font-size: 14px;
      word-break: break-word;
    }

    @media only screen and (max-width: 600px) {
      .lead-info-row {
        display: block !important;
        border-bottom: 1px solid #e5e7eb;
        margin-bottom: 4px;
        padding-bottom: 4px;
      }
      .lead-info-row:last-child {
        border-bottom: none;
      }
      .lead-info-label,
      .lead-info-value {
        display: block;
        width: 100%;
      }
      .lead-info-label {
        font-size: 13px;
        margin-bottom: 4px;
      }
    }
  </style>
</head>

<body style="margin:0;padding:0;font-family:Arial,sans-serif;">
  <div style="background:#f9fafb;padding:10px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;">

      <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">
        Lead Moved to Dispatch
      </h2>

      <p style="margin:0 0 12px;color:#111827;">
        Hello ${payload.toName ?? "there"},
      </p>

      <p style="margin:0 0 16px;color:#4b5563;">
        Dispatch planning information has been added and the project has been moved to the Dispatch stage.
      </p>

      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc;">
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Code</div>
          <div class="lead-info-value">${payload.leadCode}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Name</div>
          <div class="lead-info-value">${payload.leadName}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Onsite Contact Name</div>
          <div class="lead-info-value">${payload.onsiteContactName}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Onsite Contact Number</div>
          <div class="lead-info-value">${payload.onsiteContactNumber}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Required Delivery Date</div>
          <div class="lead-info-value">${payload.requiredDeliveryDate}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Lift Availability</div>
          <div class="lead-info-value">${payload.liftAvailability}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Moved By</div>
          <div class="lead-info-value">${payload.movedBy}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Moved On</div>
          <div class="lead-info-value">${payload.movedAt}</div>
        </div>
      </div>

      ${
        payload.projectUrl
          ? `<div style="margin:16px 0 0;text-align:start;">
              <a
                href="${payload.projectUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Dispatch
              </a>
            </div>`
          : ""
      }

    </div>
  </div>
</body>
</html>
`;

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

  const subject = template?.subject?.trim()
    ? renderTemplate(template.subject, templateValues)
    : defaultSubject;

  const text = template?.text?.trim()
    ? renderTemplate(template.text, templateValues)
    : defaultText;

  const html = template?.html?.trim()
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



