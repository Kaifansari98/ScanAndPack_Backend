import { applyVendorDomain } from "./brevoEmail.service";
import { prisma } from "../../../src/prisma/client";
import { BrevoEmailResult, sendBrevoEmail } from "./brevoEmail.service";
import logger from "../../../src/utils/logger";
import { resolveEmailIdentity } from "../../../src/validations/emailIdentity.resolver";

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
  TECH_CHECK_ASSIGNED_TEMPLATE_KEY: "TECH_CHECK_ASSIGNED",
  SITE_SUPERVISOR_ASSIGNED_TEMPLATE_KEY: "SITE_SUPERVISOR_ASSIGNED",
  BOOKING_DONE_APPROVED_TEMPLATE_KEY: "BOOKING_DONE_APPROVED",
  ORDER_LOGIN_APPROVED_TEMPLATE_KEY: "ORDER_LOGIN_APPROVED",
  DISPATCH_PLANNING_APPROVED_TEMPLATE_KEY: "DISPATCH_PLANNING_APPROVED",
  FAST_PRODUCTION_APPROVAL_REQUIRED_FACTORY: "FAST_PRODUCTION_APPROVAL_REQUIRED_FACTORY",
  FAST_PRODUCTION_SUPER_ADMIN_APPROVED: "FAST_PRODUCTION_SUPER_ADMIN_APPROVED",
  FAST_PRODUCTION_SUPER_ADMIN_REJECTED: "FAST_PRODUCTION_SUPER_ADMIN_REJECTED",
  FAST_PRODUCTION_FACTORY_APPROVED: "FAST_PRODUCTION_FACTORY_APPROVED",
  FAST_PRODUCTION_FACTORY_REJECTED: "FAST_PRODUCTION_FACTORY_REJECTED",
  FAST_PRODUCTION_FULLY_APPROVED_SALES_EXEC: "FAST_PRODUCTION_FULLY_APPROVED_SALES_EXEC",
  FAST_PRODUCTION_FULLY_APPROVED_SUPER_ADMIN: "FAST_PRODUCTION_FULLY_APPROVED_SUPER_ADMIN",
  FAST_PRODUCTION_FULLY_APPROVED_FACTORY: "FAST_PRODUCTION_FULLY_APPROVED_FACTORY",
  FAST_PRODUCTION_APPROVAL_PENDING_REMINDER_SUPER_ADMIN: "FAST_PRODUCTION_APPROVAL_PENDING_REMINDER_SUPER_ADMIN",
  FAST_PRODUCTION_APPROVAL_PENDING_REMINDER_FACTORY: "FAST_PRODUCTION_APPROVAL_PENDING_REMINDER_FACTORY",
};

export const SMALL_ORDER_TEMPLATE_KEYS = {
  SMALL_ORDER_REQUEST_SITE_SUPERVISOR_APPROVAL: "SMALL_ORDER_REQUEST_SITE_SUPERVISOR_APPROVAL",
  SMALL_ORDER_REQUEST_STORE_ADMIN_APPROVAL: "SMALL_ORDER_REQUEST_STORE_ADMIN_APPROVAL",
  // Site Supervisor Action Updates to Sales Executive
  SMALL_ORDER_REQUEST_SUPERVISOR_APPROVED: "SMALL_ORDER_REQUEST_SUPERVISOR_APPROVED",
  SMALL_ORDER_REQUEST_SUPERVISOR_REJECTED: "SMALL_ORDER_REQUEST_SUPERVISOR_REJECTED",
  // Store Admin Action Updates to Sales Executive
  SMALL_ORDER_REQUEST_ADMIN_APPROVED: "SMALL_ORDER_REQUEST_ADMIN_APPROVED",
  SMALL_ORDER_REQUEST_ADMIN_REJECTED: "SMALL_ORDER_REQUEST_ADMIN_REJECTED",
  // Fully Approved Update to Sales Executive
  SMALL_ORDER_REQUEST_FULLY_APPROVED: "SMALL_ORDER_REQUEST_FULLY_APPROVED",
  // New Small Order Lead Assigned to Backend (Order Login) User
  NEW_SMALL_ORDER_LEAD_ASSIGNED: "NEW_SMALL_ORDER_LEAD_ASSIGNED",
  // Pre Production User Update
  SMALL_ORDER_SENT_TO_PRE_PRODUCTION: "SMALL_ORDER_SENT_TO_PRE_PRODUCTION",
  // Factory User Update
  SMALL_ORDER_SENT_TO_PRODUCTION: "SMALL_ORDER_SENT_TO_PRODUCTION",
  // Production Completed Update to Sales Executive
  SMALL_ORDER_PRODUCTION_COMPLETED: "SMALL_ORDER_PRODUCTION_COMPLETED",
  // Ready for Dispatch Update to Factory User
  SMALL_ORDER_READY_FOR_DISPATCH: "SMALL_ORDER_READY_FOR_DISPATCH",
  // Dispatched updates
  SMALL_ORDER_DISPATCHED_FOR_INSTALLATION: "SMALL_ORDER_DISPATCHED_FOR_INSTALLATION",
  SMALL_ORDER_DISPATCHED: "SMALL_ORDER_DISPATCHED",
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
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName,
      subject,
      text,
      html,
    },
    identity,
  );
};
// 3
export const sendMovedToProductionWithoutOrderLoginEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName,
      subject,
      text,
      html,
    },
    identity,
  );
};
// 4
export const sendOrderLoginReminderEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName,
      subject,
      text,
      html,
    },
    identity,
  );
};
// 5
export const sendOrderLoginCompletedEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName,
      subject,
      text,
      html,
    },
    identity,
  );
};
//6
export const sendMovedToProductionWithOrderLoginEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  updatedBy: string;
  updatedAt: string;
  projectUrl: string;
  orderLoginComplete?: boolean;
}): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const olComplete = payload.orderLoginComplete !== false;

  const defaultSubject = olComplete
    ? `${payload.leadCode} - ${payload.leadName} moved to Production`
    : `${payload.leadCode} - ${payload.leadName} moved to Production with Partial Details`;

  const defaultText = olComplete
    ? [
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
        .join("\n")
    : [
        `Hello ${payload.toName ?? "there"},`,
        "",
        `The project ${payload.leadCode} - ${payload.leadName} has been moved to the Production stage.`,
        "",
        "What's Available",
        "✅ Production files have been uploaded",
        "❌ Order Login details are not yet completed",
        "",
        "You may begin preliminary production activities using the available files.",
        "However, vendor allocation, file breakup and PO details are still pending and will be updated by the Backend team shortly.",
        "Please note that final scheduling and commitments should be aligned once Order Login details are completed.",
        "",
        payload.projectUrl ? `View Production Files: ${payload.projectUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");

  const defaultHtml = olComplete
    ? `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .lead-info-row { display: table; width: 100%; padding: 4px 0; }
    .lead-info-label { display: table-cell; width: 40%; color: #6b7280; font-size: 14px; vertical-align: top; }
    .lead-info-value { display: table-cell; width: 60%; color: #111827; font-weight: 600; font-size: 14px; word-break: break-word; }
    @media only screen and (max-width: 600px) {
      .lead-info-row { display: block !important; border-bottom: 1px solid #e5e7eb; margin-bottom: 4px; padding-bottom: 4px; }
      .lead-info-row:last-child { border-bottom: none; }
      .lead-info-label, .lead-info-value { display: block; width: 100%; }
      .lead-info-label { font-size: 13px; margin-bottom: 4px; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;">
  <div style="background:#f9fafb;padding:10px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Moved to Production</h2>
      <p style="margin:0 0 12px;color:#111827;">Hello ${payload.toName ?? "there"},</p>
      <p style="margin:0 0 16px;color:#4b5563;">The project ${payload.leadCode} - ${payload.leadName} has been moved to the Production stage.</p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc;">
        <div class="lead-info-row">
          <div class="lead-info-label">Updated By</div>
          <div class="lead-info-value">${payload.updatedBy}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Updated On</div>
          <div class="lead-info-value">${payload.updatedAt}</div>
        </div>
      </div>
      ${payload.projectUrl ? `<div style="margin:16px 0 0;text-align:start;"><a href="${payload.projectUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;" target="_blank" rel="noopener noreferrer">👉 View Production Files</a></div>` : ""}
    </div>
  </div>
</body>
</html>
`
    : `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;">
  <div style="background:#f9fafb;padding:10px;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#111827;">Moved to Production (Order Login Pending)</h2>
      <p style="margin:0 0 12px;color:#111827;">Hello ${payload.toName ?? "there"},</p>
      <p style="margin:0 0 16px;color:#4b5563;">The project ${payload.leadCode} - ${payload.leadName} has been moved to the Production stage.</p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;background:#f8fafc;margin-bottom:16px;">
        <p style="margin:0 0 8px;font-weight:600;color:#111827;font-size:14px;">What's Available</p>
        <p style="margin:0 0 6px;font-size:14px;color:#374151;">✅ Production files have been uploaded</p>
        <p style="margin:0;font-size:14px;color:#374151;">❌ Order Login details are not yet completed</p>
      </div>
      <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">You may begin preliminary production activities using the available files.</p>
      <p style="margin:0 0 8px;font-size:14px;color:#4b5563;">However, vendor allocation, file breakup and PO details are still pending and will be updated by the Backend team shortly.</p>
      <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">Please note that final scheduling and commitments should be aligned once Order Login details are completed.</p>
      ${payload.projectUrl ? `<div style="text-align:start;"><a href="${payload.projectUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;" target="_blank" rel="noopener noreferrer">👉 View Production Files</a></div>` : ""}
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName,
      subject,
      text,
      html,
    },
    identity,
  );
};

// 9
export const sendUnderInstallationAssignedEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  dispatchedBy: string;
  dispatchedAt: string;
  projectUrl: string;
}): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName,
      subject,
      text,
      html,
    },
    identity,
  );
};

// factory user email
// 1
export const sendLeadMovedToDispatchEmail = async (payload: {
  allowSuperAdmin?: boolean;
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
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName,
      subject,
      text,
      html,
    },
    identity,
  );
};

// types
export type TechCheckAssignedEmailPayload = {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  assignedBy: string;
  assignedDate: string;
  leadUrl?: string;
};

// function
export const sendTechCheckAssignedEmail = async (
  payload: TechCheckAssignedEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Tech Check Review Required for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "A lead has been assigned to you for Tech Check Review.",
    "",
    "Lead Details",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Assigned By: ${payload.assignedBy}`,
    `Assigned Date: ${payload.assignedDate}`,
    "",
    "Please review the uploaded documents and either approve or reject them with remarks.",
    payload.leadUrl ? `View Lead Details: ${payload.leadUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <style>
        .lead-info-row {
          display: table;
          width: 100%;
          padding: 4px 0;
        }
        .lead-info-label {
          display: table-cell;
          color: #6b7280;
          font-size: 14px;
          width: 40%;
          vertical-align: top;
        }
        .lead-info-value {
          display: table-cell;
          color: #111827;
          font-weight: 600;
          font-size: 14px;
          width: 60%;
        }

        @media only screen and (max-width: 600px) {
          .lead-info-row {
            display: block !important;
            margin-bottom: 4px !important;
            padding-bottom: 4px !important;
            border-bottom: 1px solid #e5e7eb !important;
          }
          .lead-info-row:last-child {
            border-bottom: none !important;
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
          }
          .lead-info-label {
            display: block !important;
            width: 100% !important;
            margin-bottom: 4px !important;
            font-size: 13px !important;
          }
          .lead-info-value {
            display: block !important;
            width: 100% !important;
          }
          .lead-info-row.no-border {
            border-bottom: none !important;
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
      <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 10px;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">

          <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Tech Check Review Required</h2>

          <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>

          <p style="margin: 0 0 16px; color: #4b5563;">
            A lead has been assigned to you for Tech Check Review.
          </p>

          <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
            <p style="margin: 0 0 4px; font-weight: 600; color: #111827;">Lead Details</p>

            <div class="lead-info-row">
              <div class="lead-info-label">Lead Code</div>
              <div class="lead-info-value">${payload.leadCode}</div>
            </div>

            <div class="lead-info-row">
              <div class="lead-info-label">Lead Name</div>
              <div class="lead-info-value">${payload.leadName}</div>
            </div>

            <div class="lead-info-row">
              <div class="lead-info-label">Assigned By</div>
              <div class="lead-info-value">${payload.assignedBy}</div>
            </div>

            <div class="lead-info-row no-border">
              <div class="lead-info-label">Assigned Date</div>
              <div class="lead-info-value">${payload.assignedDate}</div>
            </div>
          </div>

          <p style="margin: 16px 0 0; color: #4b5563;">
            Please review the uploaded documents and either approve or reject them with remarks.
          </p>

      ${
        payload.leadUrl
          ? `<div style="margin:16px 0 0;text-align:start;">
              <a
                href="${payload.leadUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Lead Details
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
    assignedBy: payload.assignedBy,
    assignedDate: payload.assignedDate,
    leadUrl: payload.leadUrl ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.TECH_CHECK_ASSIGNED_TEMPLATE_KEY,
      active: true,
    },
  });

  if (template) {
    logger.info("Brevo email template source: db", {
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.TECH_CHECK_ASSIGNED_TEMPLATE_KEY,
      vendor_id: payload.vendor_id,
    });
  } else {
    logger.info("Brevo email template source: default", {
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.TECH_CHECK_ASSIGNED_TEMPLATE_KEY,
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendSiteSupervisorAssignedEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  contact: string;
  assignedTo: string;
  assignedOn: string;
  leadUrl: string;
}): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Site Supervisor Assigned on ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "Site Supervisor has been assigned for the following project.",
    "",
    "Project Details",
    `Lead Code: ${payload.leadCode}`,
    `Lead Name: ${payload.leadName}`,
    `Contact Details: ${payload.contact}`,
    `Assigned To: ${payload.assignedTo}`,
    `Assigned On: ${payload.assignedOn}`,
    "",
    `View Lead Details: ${payload.leadUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <style>
        .lead-info-row { display: table; width: 100%; padding: 4px 0; }
        .lead-info-label { display: table-cell; color: #6b7280; font-size: 14px; width: 40%; vertical-align: top; }
        .lead-info-value { display: table-cell; color: #111827; font-weight: 600; font-size: 14px; width: 60%; }
        @media only screen and (max-width: 600px) {
          .lead-info-row { display: block !important; margin-bottom: 4px !important; padding-bottom: 4px !important; border-bottom: 1px solid #e5e7eb !important; }
          .lead-info-row:last-child { border-bottom: none !important; margin-bottom: 0 !important; padding-bottom: 0 !important; }
          .lead-info-label { display: block !important; width: 100% !important; margin-bottom: 4px !important; font-size: 13px !important; }
          .lead-info-value { display: block !important; width: 100% !important; }
          .lead-info-row.no-border { border-bottom: none !important; margin-bottom: 0 !important; padding-bottom: 0 !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
      <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 10px;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
          <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Site Supervisor Assigned</h2>
          <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
          <p style="margin: 0 0 16px; color: #4b5563;">Site Supervisor has been assigned for the following project.</p>
          <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
            <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Project Details</p>
            <div class="lead-info-row">
              <div class="lead-info-label">Lead Code</div>
              <div class="lead-info-value">${payload.leadCode}</div>
            </div>
            <div class="lead-info-row">
              <div class="lead-info-label">Lead Name</div>
              <div class="lead-info-value">${payload.leadName}</div>
            </div>
            <div class="lead-info-row">
              <div class="lead-info-label">Contact Details</div>
              <div class="lead-info-value">${payload.contact}</div>
            </div>
            <div class="lead-info-row">
              <div class="lead-info-label">Assigned To</div>
              <div class="lead-info-value">${payload.assignedTo}</div>
            </div>
            <div class="lead-info-row no-border">
              <div class="lead-info-label">Assigned On</div>
              <div class="lead-info-value">${payload.assignedOn}</div>
            </div>
          </div>
          <div style="margin: 16px 0 0; text-align: start;">
            <a href="${payload.leadUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 14px;" target="_blank" rel="noopener noreferrer">
              View Lead Details
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    contact: payload.contact,
    assignedTo: payload.assignedTo,
    assignedOn: payload.assignedOn,
    leadUrl: payload.leadUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.SITE_SUPERVISOR_ASSIGNED_TEMPLATE_KEY,
      active: true,
    },
  });

  const subject = template ? renderTemplate(template.subject, templateValues) : defaultSubject;
  const text = template ? renderTemplate(template.text, templateValues) : defaultText;
  const html = template ? renderTemplate(template.html, templateValues) : defaultHtml;

  return sendBrevoEmail({ allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail, toName: payload.toName, subject, text, html }, identity);
};

export const sendBookingDoneApprovedEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  approvedBy: string;
  approvalDate: string;
  ctaLink: string;
}): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const leadDisplay = `${payload.leadCode} - ${payload.leadName}`.trim();
  const defaultSubject = `Approved: ${leadDisplay} cleared at Booking Done Stage`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "The lead has been approved by Super Admin at the Booking Done stage.",
    "",
    "Lead Details:",
    `Lead Name: ${payload.leadName}`,
    `Lead Code: ${payload.leadCode}`,
    `Approved By: ${payload.approvedBy}`,
    `Approval Date: ${payload.approvalDate}`,
    "",
    "You may now proceed with the next step:",
    `Click here to proceed: ${payload.ctaLink}`,
  ].join("\n");

  const defaultHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <style>
        .lead-info-row { display: table; width: 100%; padding: 4px 0; }
        .lead-info-label { display: table-cell; color: #6b7280; font-size: 14px; width: 40%; vertical-align: top; }
        .lead-info-value { display: table-cell; color: #111827; font-weight: 600; font-size: 14px; width: 60%; }
        @media only screen and (max-width: 600px) {
          .lead-info-row { display: block !important; margin-bottom: 4px !important; padding-bottom: 4px !important; border-bottom: 1px solid #e5e7eb !important; }
          .lead-info-row:last-child { border-bottom: none !important; margin-bottom: 0 !important; padding-bottom: 0 !important; }
          .lead-info-label { display: block !important; width: 100% !important; margin-bottom: 4px !important; font-size: 13px !important; }
          .lead-info-value { display: block !important; width: 100% !important; }
          .lead-info-row.no-border { border-bottom: none !important; margin-bottom: 0 !important; padding-bottom: 0 !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
      <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 10px;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
          <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Booking Done Approved</h2>
          <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
          <p style="margin: 0 0 16px; color: #4b5563;">The lead has been approved by Super Admin at the Booking Done stage.</p>
          <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
            <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead Details</p>
            <div class="lead-info-row">
              <div class="lead-info-label">Lead Name</div>
              <div class="lead-info-value">${payload.leadName}</div>
            </div>
            <div class="lead-info-row">
              <div class="lead-info-label">Lead Code</div>
              <div class="lead-info-value">${payload.leadCode}</div>
            </div>
            <div class="lead-info-row">
              <div class="lead-info-label">Approved By</div>
              <div class="lead-info-value">${payload.approvedBy}</div>
            </div>
            <div class="lead-info-row no-border">
              <div class="lead-info-label">Approval Date</div>
              <div class="lead-info-value">${payload.approvalDate}</div>
            </div>
          </div>
          <p style="margin: 16px 0 0; color: #4b5563;">You may now proceed with the next step:</p>
          <div style="margin: 16px 0 0; text-align: start;">
            <a href="${payload.ctaLink}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 14px;" target="_blank" rel="noopener noreferrer">
              Click here to proceed
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    approvedBy: payload.approvedBy,
    approvalDate: payload.approvalDate,
    ctaLink: payload.ctaLink,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.BOOKING_DONE_APPROVED_TEMPLATE_KEY,
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendOrderLoginApprovedEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  approvedBy: string;
  approvalDate: string;
  ctaLink: string;
}): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const leadDisplay = `${payload.leadCode} - ${payload.leadName}`.trim();
  const defaultSubject = `Approved: ${leadDisplay} cleared for Order Login`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "The lead has been approved by Super Admin for the Order Login stage.",
    "",
    "Lead Details:",
    `Lead Name: ${payload.leadName}`,
    `Lead Code: ${payload.leadCode}`,
    `Approved By: ${payload.approvedBy}`,
    `Approval Date: ${payload.approvalDate}`,
    "",
    "You can now proceed with:",
    "Uploading Production File",
    "Completing Order Login details",
    `Click here to proceed: ${payload.ctaLink}`,
  ].join("\n");

  const defaultHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <style>
        .lead-info-row { display: table; width: 100%; padding: 4px 0; }
        .lead-info-label { display: table-cell; color: #6b7280; font-size: 14px; width: 40%; vertical-align: top; }
        .lead-info-value { display: table-cell; color: #111827; font-weight: 600; font-size: 14px; width: 60%; }
        @media only screen and (max-width: 600px) {
          .lead-info-row { display: block !important; margin-bottom: 4px !important; padding-bottom: 4px !important; border-bottom: 1px solid #e5e7eb !important; }
          .lead-info-row:last-child { border-bottom: none !important; margin-bottom: 0 !important; padding-bottom: 0 !important; }
          .lead-info-label { display: block !important; width: 100% !important; margin-bottom: 4px !important; font-size: 13px !important; }
          .lead-info-value { display: block !important; width: 100% !important; }
          .lead-info-row.no-border { border-bottom: none !important; margin-bottom: 0 !important; padding-bottom: 0 !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
      <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 10px;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
          <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Order Login Approved</h2>
          <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
          <p style="margin: 0 0 16px; color: #4b5563;">The lead has been approved by Super Admin for the Order Login stage.</p>
          <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
            <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead Details</p>
            <div class="lead-info-row">
              <div class="lead-info-label">Lead Name</div>
              <div class="lead-info-value">${payload.leadName}</div>
            </div>
            <div class="lead-info-row">
              <div class="lead-info-label">Lead Code</div>
              <div class="lead-info-value">${payload.leadCode}</div>
            </div>
            <div class="lead-info-row">
              <div class="lead-info-label">Approved By</div>
              <div class="lead-info-value">${payload.approvedBy}</div>
            </div>
            <div class="lead-info-row no-border">
              <div class="lead-info-label">Approval Date</div>
              <div class="lead-info-value">${payload.approvalDate}</div>
            </div>
          </div>
          <p style="margin: 16px 0 0; color: #4b5563;">You can now proceed with:</p>
          <p style="margin: 8px 0 0; color: #111827; font-weight: 600;">Uploading Production File</p>
          <p style="margin: 6px 0 0; color: #111827; font-weight: 600;">Completing Order Login details</p>
          <div style="margin: 16px 0 0; text-align: start;">
            <a href="${payload.ctaLink}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 14px;" target="_blank" rel="noopener noreferrer">
              Click here to proceed
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    approvedBy: payload.approvedBy,
    approvalDate: payload.approvalDate,
    ctaLink: payload.ctaLink,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.ORDER_LOGIN_APPROVED_TEMPLATE_KEY,
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendDispatchPlanningApprovedEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string;
  leadCode: string;
  leadName: string;
  approvedBy: string;
  approvalDate: string;
  ctaLink: string;
}): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const leadDisplay = `${payload.leadCode} - ${payload.leadName}`.trim();
  const defaultSubject = `Approved: ${leadDisplay}  cleared for Dispatch Planning`;

  const defaultText = [
    `Hello ${payload.toName ?? "there"},`,
    "",
    "The lead has been approved by Super Admin at the Dispatch Planning stage.",
    "Lead Details:",
    `Lead Name: ${payload.leadName}`,
    `Lead Code: ${payload.leadCode}`,
    `Approved By: ${payload.approvedBy}`,
    `Approval Date: ${payload.approvalDate}`,
    "",
    "You may now proceed with:",
    "Filling Dispatch Planning details",
    "Updating On-Site Delivery Date",
    `Click here to proceed: ${payload.ctaLink}`,
  ].join("\n");

  const defaultHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
      <style>
        .lead-info-row { display: table; width: 100%; padding: 4px 0; }
        .lead-info-label { display: table-cell; color: #6b7280; font-size: 14px; width: 40%; vertical-align: top; }
        .lead-info-value { display: table-cell; color: #111827; font-weight: 600; font-size: 14px; width: 60%; }
        @media only screen and (max-width: 600px) {
          .lead-info-row { display: block !important; margin-bottom: 4px !important; padding-bottom: 4px !important; border-bottom: 1px solid #e5e7eb !important; }
          .lead-info-row:last-child { border-bottom: none !important; margin-bottom: 0 !important; padding-bottom: 0 !important; }
          .lead-info-label { display: block !important; width: 100% !important; margin-bottom: 4px !important; font-size: 13px !important; }
          .lead-info-value { display: block !important; width: 100% !important; }
          .lead-info-row.no-border { border-bottom: none !important; margin-bottom: 0 !important; padding-bottom: 0 !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif;">
      <div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 10px;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px;">
          <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Dispatch Planning Approved</h2>
          <p style="margin: 0 0 12px; color: #111827;">Hello ${payload.toName ?? "there"},</p>
          <p style="margin: 0 0 16px; color: #4b5563;">The lead has been approved by Super Admin at the Dispatch Planning stage.</p>
          <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #f8fafc;">
            <p style="margin: 0 0 8px; font-weight: 600; color: #111827;">Lead Details</p>
            <div class="lead-info-row">
              <div class="lead-info-label">Lead Name</div>
              <div class="lead-info-value">${payload.leadName}</div>
            </div>
            <div class="lead-info-row">
              <div class="lead-info-label">Lead Code</div>
              <div class="lead-info-value">${payload.leadCode}</div>
            </div>
            <div class="lead-info-row">
              <div class="lead-info-label">Approved By</div>
              <div class="lead-info-value">${payload.approvedBy}</div>
            </div>
            <div class="lead-info-row no-border">
              <div class="lead-info-label">Approval Date</div>
              <div class="lead-info-value">${payload.approvalDate}</div>
            </div>
          </div>
          <p style="margin: 16px 0 0; color: #4b5563;">You may now proceed with:</p>
          <p style="margin: 8px 0 0; color: #111827; font-weight: 600;">Filling Dispatch Planning details</p>
          <p style="margin: 6px 0 0; color: #111827; font-weight: 600;">Updating On-Site Delivery Date</p>
          <div style="margin: 16px 0 0; text-align: start;">
            <a href="${payload.ctaLink}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-size: 14px;" target="_blank" rel="noopener noreferrer">
              Click here to proceed
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    approvedBy: payload.approvedBy,
    approvalDate: payload.approvalDate,
    ctaLink: payload.ctaLink,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key:
        ORDER_LOGIN_TEMPLATE_KEYS.DISPATCH_PLANNING_APPROVED_TEMPLATE_KEY,
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface SmallOrderRequestSiteSupervisorApprovalEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  site_supervisor_name: string;
  leadCode: string;
  leadName: string;
  sales_executive_name: string;
  projectUrl: string;
}

export const sendSmallOrderRequestSiteSupervisorApprovalEmail = async (
  payload: SmallOrderRequestSiteSupervisorApprovalEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Approval Request – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.site_supervisor_name},`,
    "",
    `A Small Order request has been raised by ${payload.sales_executive_name} for ${payload.leadCode} - ${payload.leadName}`,
    "",
    "Please review the request and approve or reject it.",
    "",
    payload.projectUrl ? `Review Small Order: ${payload.projectUrl}` : "",
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
        Small Order Approval Request
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.site_supervisor_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        A Small Order request has been raised by ${payload.sales_executive_name} for <strong>${payload.leadCode} - ${payload.leadName}</strong>.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Please review the request and approve or reject it.
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
          <div class="lead-info-label">Raised By</div>
          <div class="lead-info-value">${payload.sales_executive_name}</div>
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
                Review Small Order
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
    toName: payload.site_supervisor_name,
    site_supervisor_name: payload.site_supervisor_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    sales_executive_name: payload.sales_executive_name,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_REQUEST_SITE_SUPERVISOR_APPROVAL,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.site_supervisor_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface SmallOrderRequestStoreAdminApprovalEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  store_admin_name: string;
  leadCode: string;
  leadName: string;
  sales_executive_name: string;
  projectUrl: string;
}

export const sendSmallOrderRequestStoreAdminApprovalEmail = async (
  payload: SmallOrderRequestStoreAdminApprovalEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Approval Request – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.store_admin_name},`,
    "",
    `A Small Order request has been raised by ${payload.sales_executive_name} for ${payload.leadCode} - ${payload.leadName}`,
    "",
    "Please review the request and approve or reject it.",
    "",
    payload.projectUrl ? `Review Small Order: ${payload.projectUrl}` : "",
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
        Small Order Approval Request
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.store_admin_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        A Small Order request has been raised by ${payload.sales_executive_name} for <strong>${payload.leadCode} - ${payload.leadName}</strong>.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Please review the request and approve or reject it.
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
          <div class="lead-info-label">Raised By</div>
          <div class="lead-info-value">${payload.sales_executive_name}</div>
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
                Review Small Order
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
    toName: payload.store_admin_name,
    store_admin_name: payload.store_admin_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    sales_executive_name: payload.sales_executive_name,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_REQUEST_STORE_ADMIN_APPROVAL,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.store_admin_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

// ==========================================
// Site Supervisor Action – Sales Executive Update
// ==========================================

export interface SmallOrderRequestSupervisorApprovedEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  sales_executive_name: string;
  leadCode: string;
  leadName: string;
  site_supervisor_name: string;
  projectUrl: string;
}

export const sendSmallOrderRequestSupervisorApprovedEmail = async (
  payload: SmallOrderRequestSupervisorApprovedEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Approved by Site Supervisor – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.sales_executive_name},`,
    "",
    `The Small Order request for ${payload.leadCode} - ${payload.leadName} has been approved by ${payload.site_supervisor_name}.`,
    "The request is now awaiting Store Admin approval, if not already completed.",
    "",
    payload.projectUrl ? `View Small Order: ${payload.projectUrl}` : "",
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
        Small Order Request Approved
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.sales_executive_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        The Small Order request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been approved by ${payload.site_supervisor_name}.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        The request is now awaiting Store Admin approval, if not already completed.
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
          <div class="lead-info-label">Approved By</div>
          <div class="lead-info-value">${payload.site_supervisor_name}</div>
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
                View Small Order
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
    toName: payload.sales_executive_name,
    sales_executive_name: payload.sales_executive_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    site_supervisor_name: payload.site_supervisor_name,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_REQUEST_SUPERVISOR_APPROVED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.sales_executive_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface SmallOrderRequestSupervisorRejectedEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  sales_executive_name: string;
  leadCode: string;
  leadName: string;
  site_supervisor_name: string;
  rejection_reason: string;
  projectUrl: string;
}

export const sendSmallOrderRequestSupervisorRejectedEmail = async (
  payload: SmallOrderRequestSupervisorRejectedEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Rejected by Site Supervisor – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.sales_executive_name},`,
    "",
    `The Small Order request for ${payload.leadCode} - ${payload.leadName} has been rejected by ${payload.site_supervisor_name}.`,
    `Reason: ${payload.rejection_reason}`,
    "",
    payload.projectUrl ? `View Rejection Details: ${payload.projectUrl}` : "",
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
        Small Order Request Rejected
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.sales_executive_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        The Small Order request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been rejected by ${payload.site_supervisor_name}.
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
          <div class="lead-info-label">Rejected By</div>
          <div class="lead-info-value">${payload.site_supervisor_name}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Reason</div>
          <div class="lead-info-value">${payload.rejection_reason}</div>
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
                View Rejection Details
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
    toName: payload.sales_executive_name,
    sales_executive_name: payload.sales_executive_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    site_supervisor_name: payload.site_supervisor_name,
    rejection_reason: payload.rejection_reason,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_REQUEST_SUPERVISOR_REJECTED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.sales_executive_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

// ==========================================
// Store Admin Action – Sales Executive Update
// ==========================================

export interface SmallOrderRequestAdminApprovedEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  sales_executive_name: string;
  leadCode: string;
  leadName: string;
  store_admin_name: string;
  projectUrl: string;
}

export const sendSmallOrderRequestAdminApprovedEmail = async (
  payload: SmallOrderRequestAdminApprovedEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Approved by Store Admin – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.sales_executive_name},`,
    "",
    `The Small Order request for ${payload.leadCode} - ${payload.leadName} has been approved by ${payload.store_admin_name}.`,
    "The request is now awaiting Site Supervisor approval, if not already completed.",
    "",
    payload.projectUrl ? `View Small Order: ${payload.projectUrl}` : "",
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
        Small Order Request Approved
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.sales_executive_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        The Small Order request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been approved by ${payload.store_admin_name}.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        The request is now awaiting Site Supervisor approval, if not already completed.
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
          <div class="lead-info-label">Approved By</div>
          <div class="lead-info-value">${payload.store_admin_name}</div>
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
                View Small Order
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
    toName: payload.sales_executive_name,
    sales_executive_name: payload.sales_executive_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    store_admin_name: payload.store_admin_name,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_REQUEST_ADMIN_APPROVED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.sales_executive_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface SmallOrderRequestAdminRejectedEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  sales_executive_name: string;
  leadCode: string;
  leadName: string;
  store_admin_name: string;
  rejection_reason: string;
  projectUrl: string;
}

export const sendSmallOrderRequestAdminRejectedEmail = async (
  payload: SmallOrderRequestAdminRejectedEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Rejected by Store Admin – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.sales_executive_name},`,
    "",
    `The Small Order request for ${payload.leadCode} - ${payload.leadName} has been rejected by ${payload.store_admin_name}.`,
    `Reason: ${payload.rejection_reason}`,
    "",
    payload.projectUrl ? `View Rejection Details: ${payload.projectUrl}` : "",
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
        Small Order Request Rejected
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.sales_executive_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        The Small Order request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been rejected by ${payload.store_admin_name}.
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
          <div class="lead-info-label">Rejected By</div>
          <div class="lead-info-value">${payload.store_admin_name}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Reason</div>
          <div class="lead-info-value">${payload.rejection_reason}</div>
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
                View Rejection Details
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
    toName: payload.sales_executive_name,
    sales_executive_name: payload.sales_executive_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    store_admin_name: payload.store_admin_name,
    rejection_reason: payload.rejection_reason,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_REQUEST_ADMIN_REJECTED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.sales_executive_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface NewSmallOrderLeadAssignedEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  order_login_user_name: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}

export const sendNewSmallOrderLeadAssignedEmail = async (
  payload: NewSmallOrderLeadAssignedEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `New Small Order Lead Assigned – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.order_login_user_name},`,
    "",
    `A new Small Order lead has been created for ${payload.leadCode} - ${payload.leadName}`,
    "Please review the details and complete the Order Login process.",
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
        New Small Order Lead Assigned
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.order_login_user_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        A new Small Order lead has been created for <strong>${payload.leadCode} - ${payload.leadName}</strong>.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Please review the details and complete the Order Login process.
      </p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc;margin-bottom:16px;">
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Code</div>
          <div class="lead-info-value">${payload.leadCode}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Name</div>
          <div class="lead-info-value">${payload.leadName}</div>
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
    toName: payload.order_login_user_name,
    order_login_user_name: payload.order_login_user_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.NEW_SMALL_ORDER_LEAD_ASSIGNED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.order_login_user_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface SmallOrderRequestFullyApprovedEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  sales_executive_name: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}

export const sendSmallOrderRequestFullyApprovedEmail = async (
  payload: SmallOrderRequestFullyApprovedEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Fully Approved – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.sales_executive_name},`,
    "",
    `The Small Order request for ${payload.leadCode} - ${payload.leadName} has been approved by both the Site Supervisor and Store Admin.`,
    "A new Small Order lead has been created and moved to Order Login.",
    "",
    payload.projectUrl ? `View Small Order: ${payload.projectUrl}` : "",
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
        Small Order Fully Approved
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.sales_executive_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        The Small Order request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been approved by both the Site Supervisor and Store Admin.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        A new Small Order lead has been created and moved to Order Login.
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
          <div class="lead-info-label">Status</div>
          <div class="lead-info-value" style="color:#16a34a;">Fully Approved</div>
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
                View Small Order
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
    toName: payload.sales_executive_name,
    sales_executive_name: payload.sales_executive_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_REQUEST_FULLY_APPROVED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.sales_executive_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface SmallOrderSentToPreProductionEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  pre_production_user_name: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}

export const sendSmallOrderSentToPreProductionEmail = async (
  payload: SmallOrderSentToPreProductionEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Sent for Pre Production – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.pre_production_user_name},`,
    "",
    `Order Login has been completed for the Small Order request of ${payload.leadCode} - ${payload.leadName}.`,
    "Please review the order and upload the required Pre-Production file.",
    "",
    payload.projectUrl ? `Review Small Order: ${payload.projectUrl}` : "",
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
        Small Order Sent for Pre Production
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.pre_production_user_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Order Login has been completed for the Small Order request of <strong>${payload.leadCode} - ${payload.leadName}</strong>.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Please review the order and upload the required Pre-Production file.
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
      ${
        payload.projectUrl
          ? `<div style="margin:16px 0 0;text-align:start;">
              <a
                href="${payload.projectUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;"
                target="_blank"
                rel="noopener noreferrer"
              >
                Review Small Order
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
    toName: payload.pre_production_user_name,
    pre_production_user_name: payload.pre_production_user_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_SENT_TO_PRE_PRODUCTION,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.pre_production_user_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface SmallOrderSentToFactoryEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  factory_user_name: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}

export const sendSmallOrderSentToFactoryEmail = async (
  payload: SmallOrderSentToFactoryEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Sent for Production – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.factory_user_name},`,
    "",
    `A Small Order for ${payload.leadCode} - ${payload.leadName} has been sent for production after Order Login completion.`,
    "Please review the order details and proceed with the production process.",
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
        Small Order Sent for Production
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.factory_user_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        A Small Order for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been sent for production after Order Login completion.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Please review the order details and proceed with the production process.
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
    toName: payload.factory_user_name,
    factory_user_name: payload.factory_user_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_SENT_TO_PRODUCTION,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.factory_user_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface SmallOrderProductionCompletedEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  sales_executive_name: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}

export const sendSmallOrderProductionCompletedEmail = async (
  payload: SmallOrderProductionCompletedEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Production Completed – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.sales_executive_name},`,
    "",
    `Production has been completed for the Small Order of ${payload.leadCode} - ${payload.leadName}.`,
    "Please complete the Dispatch Planning details to proceed further.",
    "",
    payload.projectUrl ? `Complete Dispatch Planning: ${payload.projectUrl}` : "",
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
        Small Order Production Completed
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.sales_executive_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Production has been completed for the Small Order of <strong>${payload.leadCode} - ${payload.leadName}</strong>.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Please complete the Dispatch Planning details to proceed further.
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
      ${
        payload.projectUrl
          ? `<div style="margin:16px 0 0;text-align:start;">
              <a
                href="${payload.projectUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;"
                target="_blank"
                rel="noopener noreferrer"
              >
                Complete Dispatch Planning
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
    toName: payload.sales_executive_name,
    sales_executive_name: payload.sales_executive_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_PRODUCTION_COMPLETED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.sales_executive_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface SmallOrderReadyForDispatchEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  factory_user_name: string;
  leadCode: string;
  leadName: string;
  projectUrl: string;
}

export const sendSmallOrderReadyForDispatchEmail = async (
  payload: SmallOrderReadyForDispatchEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Ready for Dispatch – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.factory_user_name},`,
    "",
    `Dispatch Planning has been completed for the Small Order of ${payload.leadCode} - ${payload.leadName}.`,
    "Please update the dispatch date and dispatch information.",
    "",
    payload.projectUrl ? `Update Dispatch Details: ${payload.projectUrl}` : "",
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
        Small Order Ready for Dispatch
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.factory_user_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Dispatch Planning has been completed for the Small Order of <strong>${payload.leadCode} - ${payload.leadName}</strong>.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Please update the dispatch date and dispatch information.
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
      ${
        payload.projectUrl
          ? `<div style="margin:16px 0 0;text-align:start;">
              <a
                href="${payload.projectUrl}"
                style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;"
                target="_blank"
                rel="noopener noreferrer"
              >
                Update Dispatch Details
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
    toName: payload.factory_user_name,
    factory_user_name: payload.factory_user_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_READY_FOR_DISPATCH,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.factory_user_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface SmallOrderDispatchedForInstallationEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  site_supervisor_name: string;
  leadCode: string;
  leadName: string;
  dispatch_date: string;
  projectUrl: string;
}

export const sendSmallOrderDispatchedForInstallationEmail = async (
  payload: SmallOrderDispatchedForInstallationEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Dispatched for Installation – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.site_supervisor_name},`,
    "",
    `The Small Order for ${payload.leadCode} - ${payload.leadName} has been dispatched and moved to Under Installation.`,
    "Please review the details and update the installation progress as required.",
    `Dispatch Date: ${payload.dispatch_date}`,
    "",
    payload.projectUrl ? `Update Installation: ${payload.projectUrl}` : "",
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
        Small Order Dispatched for Installation
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.site_supervisor_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        The Small Order for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been dispatched and moved to Under Installation.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        Please review the details and update the installation progress as required.
      </p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc;margin-bottom:16px;">
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Code</div>
          <div class="lead-info-value">${payload.leadCode}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Name</div>
          <div class="lead-info-value">${payload.leadName}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Dispatch Date</div>
          <div class="lead-info-value">${payload.dispatch_date}</div>
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
                Update Installation
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
    toName: payload.site_supervisor_name,
    site_supervisor_name: payload.site_supervisor_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    dispatch_date: payload.dispatch_date,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_DISPATCHED_FOR_INSTALLATION,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.site_supervisor_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

export interface SmallOrderDispatchedEmailPayload {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  sales_executive_name: string;
  leadCode: string;
  leadName: string;
  dispatch_date: string;
  projectUrl: string;
}

export const sendSmallOrderDispatchedEmail = async (
  payload: SmallOrderDispatchedEmailPayload,
): Promise<BrevoEmailResult> => {
  payload = await applyVendorDomain(payload);
const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Small Order Dispatched – ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.sales_executive_name},`,
    "",
    `The Small Order for ${payload.leadCode} - ${payload.leadName} has been dispatched successfully.`,
    `Dispatch Date: ${payload.dispatch_date}`,
    "The order has now been moved to Under Installation for Site Supervisor updates.",
    "",
    payload.projectUrl ? `View Small Order: ${payload.projectUrl}` : "",
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
        Small Order Dispatched
      </h2>
      <p style="margin:0 0 12px;color:#111827;">
        Hi ${payload.sales_executive_name},
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        The Small Order for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been dispatched successfully.
      </p>
      <p style="margin:0 0 16px;color:#4b5563;">
        The order has now been moved to Under Installation for Site Supervisor updates.
      </p>
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;background:#f8fafc;margin-bottom:16px;">
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Code</div>
          <div class="lead-info-value">${payload.leadCode}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Lead Name</div>
          <div class="lead-info-value">${payload.leadName}</div>
        </div>
        <div class="lead-info-row">
          <div class="lead-info-label">Dispatch Date</div>
          <div class="lead-info-value">${payload.dispatch_date}</div>
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
                View Small Order
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
    toName: payload.sales_executive_name,
    sales_executive_name: payload.sales_executive_name,
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    dispatch_date: payload.dispatch_date,
    projectUrl: payload.projectUrl,
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: SMALL_ORDER_TEMPLATE_KEYS.SMALL_ORDER_DISPATCHED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.sales_executive_name,
      subject,
      text,
      html,
    },
    identity,
  );
};

// Fast Production Approval Request — Factory User
export const sendFastProductionApprovalRequiredFactoryEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  raisedBy: string;
  ctaLink?: string;
}): Promise<BrevoEmailResult> => {
  const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Fast Production Approval Request for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.toName ?? "there"},`,
    "",
    `A Fast Production request has been raised by ${payload.raisedBy} for ${payload.leadCode} - ${payload.leadName}.`,
    "",
    "The client requires delivery at the earliest, and this request requires your approval before the fast production timeline can be applied.",
    "",
    "Please review the request and approve or reject it.",
    "",
    payload.ctaLink ? `Review Fast Production Request: ${payload.ctaLink}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
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
      .lead-info-row { display: block !important; margin-bottom: 4px !important; }
      .lead-info-label, .lead-info-value { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#111827;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Fast Production Approval Request</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${payload.toName ?? "there"},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                A Fast Production request has been raised by <strong>${payload.raisedBy}</strong> for the following lead. The client requires delivery at the earliest, and this request requires your approval before the fast production timeline can be applied.
              </p>
              <p style="margin:0 0 12px;font-size:15px;color:#111827;font-weight:600;">Lead Details:</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-top:1px solid #e5e7eb;">
                <tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
                  <div class="lead-info-row">
                    <span class="lead-info-label">Lead Name</span>
                    <span class="lead-info-value">${payload.leadName}</span>
                  </div>
                </td></tr>
                <tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
                  <div class="lead-info-row">
                    <span class="lead-info-label">Lead Code</span>
                    <span class="lead-info-value">${payload.leadCode}</span>
                  </div>
                </td></tr>
                <tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
                  <div class="lead-info-row">
                    <span class="lead-info-label">Raised By</span>
                    <span class="lead-info-value">${payload.raisedBy}</span>
                  </div>
                </td></tr>
              </table>
              <p style="margin:0 0 20px;font-size:15px;color:#374151;">
                Please review the request and approve or reject it at the earliest.
              </p>
              ${
                payload.ctaLink
                  ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background-color:#111827;border-radius:6px;padding:12px 24px;">
                          <a href="${payload.ctaLink}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Review Fast Production Request</a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
              <p style="margin:0;font-size:14px;color:#4b5563;">
                Note: The fast production timeline will only be applied after your approval.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const templateValues = {
    toName: payload.toName ?? "there",
    leadCode: payload.leadCode,
    leadName: payload.leadName,
    raisedBy: payload.raisedBy,
    ctaLink: payload.ctaLink ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.FAST_PRODUCTION_APPROVAL_REQUIRED_FACTORY,
      active: true,
    },
  });

  logger.info("Brevo email template source", {
    template_key: ORDER_LOGIN_TEMPLATE_KEYS.FAST_PRODUCTION_APPROVAL_REQUIRED_FACTORY,
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName ?? undefined,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendFastProductionSuperAdminApprovedEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  superAdminName: string;
  salesExecutiveName: string;
  ctaLink?: string;
}): Promise<BrevoEmailResult> => {
  const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Fast Production Approved by Super Admin for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.salesExecutiveName},`,
    "",
    `The Fast Production request for ${payload.leadCode} - ${payload.leadName} has been approved by ${payload.superAdminName}.`,
    "",
    "The request is now awaiting Factory User approval, if not already completed.",
    "",
    payload.ctaLink ? `View Fast Production Request: ${payload.ctaLink}` : "",
  ].filter(Boolean).join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#111827;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Fast Production Approved</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${payload.salesExecutiveName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The Fast Production request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been approved by <strong>${payload.superAdminName}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The request is now awaiting Factory User approval, if not already completed.
              </p>
              ${
                payload.ctaLink
                  ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background-color:#111827;border-radius:6px;padding:12px 24px;">
                          <a href="${payload.ctaLink}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View Fast Production Request</a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const templateValues = {
    sales_executive_name: payload.salesExecutiveName,
    "Lead Code - Lead Name": `${payload.leadCode} - ${payload.leadName}`,
    super_admin_name: payload.superAdminName,
    ctaLink: payload.ctaLink ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.FAST_PRODUCTION_SUPER_ADMIN_APPROVED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName ?? undefined,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendFastProductionSuperAdminRejectedEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  superAdminName: string;
  salesExecutiveName: string;
  rejectionReason: string;
  ctaLink?: string;
}): Promise<BrevoEmailResult> => {
  const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Fast Production Rejected by Super Admin for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.salesExecutiveName},`,
    "",
    `The Fast Production request for ${payload.leadCode} - ${payload.leadName} has been rejected by ${payload.superAdminName}.`,
    "",
    `Reason: ${payload.rejectionReason}`,
    "",
    "The fast production timeline will not be applied to this project.",
    "",
    payload.ctaLink ? `View Rejection Details: ${payload.ctaLink}` : "",
  ].filter(Boolean).join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#ef4444;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Fast Production Rejected</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${payload.salesExecutiveName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The Fast Production request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been rejected by <strong>${payload.superAdminName}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                <strong>Reason:</strong> ${payload.rejectionReason}
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The fast production timeline will not be applied to this project.
              </p>
              ${
                payload.ctaLink
                  ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background-color:#111827;border-radius:6px;padding:12px 24px;">
                          <a href="${payload.ctaLink}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View Rejection Details</a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const templateValues = {
    sales_executive_name: payload.salesExecutiveName,
    "Lead Code - Lead Name": `${payload.leadCode} - ${payload.leadName}`,
    super_admin_name: payload.superAdminName,
    rejection_reason: payload.rejectionReason,
    ctaLink: payload.ctaLink ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.FAST_PRODUCTION_SUPER_ADMIN_REJECTED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName ?? undefined,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendFastProductionFactoryApprovedEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  factoryUserName: string;
  salesExecutiveName: string;
  expectedReadyDate: string;
  ctaLink?: string;
}): Promise<BrevoEmailResult> => {
  const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Fast Production Approved by Factory User for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.salesExecutiveName},`,
    "",
    `The Fast Production request for ${payload.leadCode} - ${payload.leadName} has been approved by ${payload.factoryUserName}.`,
    "",
    `The Expected Ready Date is ${payload.expectedReadyDate}`,
    "",
    "The request is now awaiting Super Admin approval, if not already completed.",
    "",
    payload.ctaLink ? `View Fast Production Request: ${payload.ctaLink}` : "",
  ].filter(Boolean).join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#111827;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Fast Production Approved</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${payload.salesExecutiveName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The Fast Production request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been approved by <strong>${payload.factoryUserName}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The Expected Ready Date is <strong>${payload.expectedReadyDate}</strong>
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The request is now awaiting Super Admin approval, if not already completed.
              </p>
              ${
                payload.ctaLink
                  ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background-color:#111827;border-radius:6px;padding:12px 24px;">
                          <a href="${payload.ctaLink}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View Fast Production Request</a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const templateValues = {
    sales_executive_name: payload.salesExecutiveName,
    "Lead Code - Lead Name": `${payload.leadCode} - ${payload.leadName}`,
    factory_user_name: payload.factoryUserName,
    expected_ready_date: payload.expectedReadyDate,
    ctaLink: payload.ctaLink ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.FAST_PRODUCTION_FACTORY_APPROVED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName ?? undefined,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendFastProductionFactoryRejectedEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  factoryUserName: string;
  salesExecutiveName: string;
  rejectionReason: string;
  ctaLink?: string;
}): Promise<BrevoEmailResult> => {
  const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Fast Production Rejected by Factory User for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.salesExecutiveName},`,
    "",
    `The Fast Production request for ${payload.leadCode} - ${payload.leadName} has been rejected by ${payload.factoryUserName}.`,
    "",
    `Reason: ${payload.rejectionReason}`,
    "",
    "The fast production timeline will not be applied to this project.",
    "",
    payload.ctaLink ? `View Rejection Details: ${payload.ctaLink}` : "",
  ].filter(Boolean).join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#ef4444;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Fast Production Rejected</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${payload.salesExecutiveName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The Fast Production request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been rejected by <strong>${payload.factoryUserName}</strong>.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                <strong>Reason:</strong> ${payload.rejectionReason}
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The fast production timeline will not be applied to this project.
              </p>
              ${
                payload.ctaLink
                  ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background-color:#111827;border-radius:6px;padding:12px 24px;">
                          <a href="${payload.ctaLink}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View Rejection Details</a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const templateValues = {
    sales_executive_name: payload.salesExecutiveName,
    "Lead Code - Lead Name": `${payload.leadCode} - ${payload.leadName}`,
    factory_user_name: payload.factoryUserName,
    rejection_reason: payload.rejectionReason,
    ctaLink: payload.ctaLink ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.FAST_PRODUCTION_FACTORY_REJECTED,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName ?? undefined,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendFastProductionFullyApprovedSalesExecEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  salesExecutiveName: string;
  fastProductionTimeline: string;
  ctaLink?: string;
}): Promise<BrevoEmailResult> => {
  const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Fast Production Fully Approved for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.salesExecutiveName},`,
    "",
    `The Fast Production request for ${payload.leadCode} - ${payload.leadName} has been approved by both the Super Admin and Factory User.`,
    "",
    "The fast production timeline has now been applied to the selected project.",
    "",
    `Fast Production Timeline: ${payload.fastProductionTimeline}`,
    "",
    payload.ctaLink ? `View Updated Project Timeline: ${payload.ctaLink}` : "",
  ].filter(Boolean).join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#111827;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Fast Production Fully Approved</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${payload.salesExecutiveName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The Fast Production request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been approved by both the Super Admin and Factory User.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The fast production timeline has now been applied to the selected project.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                <strong>Fast Production Timeline:</strong> ${payload.fastProductionTimeline}
              </p>
              ${
                payload.ctaLink
                  ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background-color:#111827;border-radius:6px;padding:12px 24px;">
                          <a href="${payload.ctaLink}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View Updated Project Timeline</a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const templateValues = {
    sales_executive_name: payload.salesExecutiveName,
    "Lead Code - Lead Name": `${payload.leadCode} - ${payload.leadName}`,
    fast_production_timeline: payload.fastProductionTimeline,
    ctaLink: payload.ctaLink ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.FAST_PRODUCTION_FULLY_APPROVED_SALES_EXEC,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName ?? undefined,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendFastProductionFullyApprovedSuperAdminEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  superAdminName: string;
  ctaLink?: string;
}): Promise<BrevoEmailResult> => {
  const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Fast Production Timeline Applied for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.superAdminName},`,
    "",
    `The Fast Production request for ${payload.leadCode} - ${payload.leadName} has been approved by both required users.`,
    "",
    "The fast production timeline has now been applied to the selected project.",
    "",
    payload.ctaLink ? `View Project Timeline: ${payload.ctaLink}` : "",
  ].filter(Boolean).join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#111827;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Fast Production Timeline Applied</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${payload.superAdminName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The Fast Production request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been approved by both required users.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The fast production timeline has now been applied to the selected project.
              </p>
              ${
                payload.ctaLink
                  ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background-color:#111827;border-radius:6px;padding:12px 24px;">
                          <a href="${payload.ctaLink}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View Project Timeline</a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const templateValues = {
    super_admin_name: payload.superAdminName,
    "Lead Code - Lead Name": `${payload.leadCode} - ${payload.leadName}`,
    ctaLink: payload.ctaLink ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.FAST_PRODUCTION_FULLY_APPROVED_SUPER_ADMIN,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName ?? undefined,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendFastProductionFullyApprovedFactoryEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  factoryUserName: string;
  ctaLink?: string;
}): Promise<BrevoEmailResult> => {
  const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Fast Production Timeline Applied for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.factoryUserName},`,
    "",
    `The Fast Production request for ${payload.leadCode} - ${payload.leadName} has been approved by both required users.`,
    "",
    "The fast production timeline has now been applied to the selected project.",
    "",
    "Please proceed according to the updated production timeline.",
    "",
    payload.ctaLink ? `View Production Timeline: ${payload.ctaLink}` : "",
  ].filter(Boolean).join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#111827;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Fast Production Timeline Applied</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${payload.factoryUserName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The Fast Production request for <strong>${payload.leadCode} - ${payload.leadName}</strong> has been approved by both required users.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The fast production timeline has now been applied to the selected project.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                Please proceed according to the updated production timeline.
              </p>
              ${
                payload.ctaLink
                  ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background-color:#111827;border-radius:6px;padding:12px 24px;">
                          <a href="${payload.ctaLink}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View Production Timeline</a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const templateValues = {
    factory_user_name: payload.factoryUserName,
    "Lead Code - Lead Name": `${payload.leadCode} - ${payload.leadName}`,
    ctaLink: payload.ctaLink ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.FAST_PRODUCTION_FULLY_APPROVED_FACTORY,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName ?? undefined,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendFastProductionApprovalPendingReminderSuperAdminEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  superAdminName: string;
  ctaLink?: string;
}): Promise<BrevoEmailResult> => {
  const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Reminder: Fast Production Approval Pending for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.superAdminName},`,
    "",
    `The Fast Production request for ${payload.leadCode} - ${payload.leadName} is still pending your approval.`,
    "",
    "Please review and take action so the project timeline can be updated accordingly.",
    "",
    payload.ctaLink ? `Review Fast Production Request: ${payload.ctaLink}` : "",
  ].filter(Boolean).join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#eab308;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Approval Pending Reminder</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${payload.superAdminName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The Fast Production request for <strong>${payload.leadCode} - ${payload.leadName}</strong> is still pending your approval.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                Please review and take action so the project timeline can be updated accordingly.
              </p>
              ${
                payload.ctaLink
                  ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background-color:#111827;border-radius:6px;padding:12px 24px;">
                          <a href="${payload.ctaLink}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Review Fast Production Request</a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const templateValues = {
    super_admin_name: payload.superAdminName,
    "Lead Code - Lead Name": `${payload.leadCode} - ${payload.leadName}`,
    ctaLink: payload.ctaLink ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.FAST_PRODUCTION_APPROVAL_PENDING_REMINDER_SUPER_ADMIN,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName ?? undefined,
      subject,
      text,
      html,
    },
    identity,
  );
};

export const sendFastProductionApprovalPendingReminderFactoryEmail = async (payload: {
  allowSuperAdmin?: boolean;
  vendor_id: number;
  toEmail: string;
  toName?: string | null;
  leadCode: string;
  leadName: string;
  factoryUserName: string;
  ctaLink?: string;
}): Promise<BrevoEmailResult> => {
  const identity = await resolveEmailIdentity(payload.vendor_id);
  const defaultSubject = `Reminder: Fast Production Approval Pending for ${payload.leadCode} - ${payload.leadName}`;

  const defaultText = [
    `Hi ${payload.factoryUserName},`,
    "",
    `The Fast Production request for ${payload.leadCode} - ${payload.leadName} is still pending your approval.`,
    "",
    "Please review and take action so the project timeline can be updated accordingly.",
    "",
    payload.ctaLink ? `Review Fast Production Request: ${payload.ctaLink}` : "",
  ].filter(Boolean).join("\n");

  const defaultHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#eab308;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">Approval Pending Reminder</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">Hi ${payload.factoryUserName},</p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                The Fast Production request for <strong>${payload.leadCode} - ${payload.leadName}</strong> is still pending your approval.
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;">
                Please review and take action so the project timeline can be updated accordingly.
              </p>
              ${
                payload.ctaLink
                  ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background-color:#111827;border-radius:6px;padding:12px 24px;">
                          <a href="${payload.ctaLink}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Review Fast Production Request</a>
                        </td>
                      </tr>
                    </table>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const templateValues = {
    factory_user_name: payload.factoryUserName,
    "Lead Code - Lead Name": `${payload.leadCode} - ${payload.leadName}`,
    ctaLink: payload.ctaLink ?? "",
  };

  const template = await prisma.emailNotificationMaster.findFirst({
    where: {
      vendor_id: payload.vendor_id,
      template_key: ORDER_LOGIN_TEMPLATE_KEYS.FAST_PRODUCTION_APPROVAL_PENDING_REMINDER_FACTORY,
      active: true,
    },
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

  return sendBrevoEmail(
    {
      allowSuperAdmin: payload.allowSuperAdmin,
      toEmail: payload.toEmail,
      toName: payload.toName ?? undefined,
      subject,
      text,
      html,
    },
    identity,
  );
};


