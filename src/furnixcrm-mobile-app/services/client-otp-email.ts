// Email sent to a client (LeadMaster.email) with their FurnixCRM app sign-in code.
// Table layout with inline styles so it renders consistently in Gmail, Outlook and Apple Mail.

const COLORS = {
  primary: "#493630",
  secondary: "#E25827",
  canvas: "#241B17",
  page: "#F5F0ED",
  codeBg: "#FDF4EF",
  muted: "#7A6A64",
  border: "#EBE3DF",
} as const;

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export type ClientOtpEmailVendor = {
  vendor_name: string;
  logoUrl: string | null;
  tag_line: string | null;
  website_link: string | null;
  toll_free_no: string | null;
  primary_contact_email: string | null;
  address: string | null;
  city: string | null;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const websiteHref = (link: string) => (/^https?:\/\//i.test(link) ? link : `https://${link}`);

export function buildClientOtpEmail({
  otp,
  clientName,
  minutes,
  vendor,
}: {
  otp: string;
  clientName: string;
  minutes: number;
  vendor: ClientOtpEmailVendor;
}) {
  const vendorName = escapeHtml(vendor.vendor_name);
  const greetingName = escapeHtml(clientName || "there");

  const logo = vendor.logoUrl
    ? `<img src="${escapeHtml(vendor.logoUrl)}" alt="${vendorName}" height="52" style="display:block;height:52px;width:auto;max-width:220px;border:0;outline:none;text-decoration:none;">`
    : `<span style="font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:-0.5px;color:${COLORS.primary};">${vendorName}</span>`;

  const digits = otp
    .split("")
    .map(
      (digit) =>
        `<td align="center" style="width:44px;height:56px;background:#FFFFFF;border:1px solid ${COLORS.border};border-radius:10px;font-family:${FONT};font-size:28px;font-weight:700;color:${COLORS.secondary};">${digit}</td>`,
    )
    .join(`<td style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`);

  const location = [vendor.address, vendor.city].filter(Boolean).join(", ");
  const contactLinks = [
    vendor.website_link
      ? `<a href="${escapeHtml(websiteHref(vendor.website_link))}" style="color:#FFFFFF;text-decoration:none;">${escapeHtml(vendor.website_link.replace(/^https?:\/\//i, ""))}</a>`
      : null,
    vendor.toll_free_no
      ? `<a href="tel:${escapeHtml(vendor.toll_free_no.replace(/\s/g, ""))}" style="color:#FFFFFF;text-decoration:none;">${escapeHtml(vendor.toll_free_no)}</a>`
      : null,
    vendor.primary_contact_email
      ? `<a href="mailto:${escapeHtml(vendor.primary_contact_email)}" style="color:#FFFFFF;text-decoration:none;">${escapeHtml(vendor.primary_contact_email)}</a>`
      : null,
  ].filter(Boolean);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${otp} is your ${vendorName} sign-in code</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.page};">Your ${vendorName} sign-in code is ${otp}. It expires in ${minutes} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

        <!-- Card -->
        <tr>
          <td style="background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(36,27,23,0.08);">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:6px;background:${COLORS.secondary};font-size:0;line-height:0;">&nbsp;</td></tr>

              <!-- Logo -->
              <tr>
                <td align="center" style="padding:32px 32px 8px;">${logo}</td>
              </tr>
              ${
                vendor.tag_line
                  ? `<tr><td align="center" style="padding:0 32px;font-family:${FONT};font-size:12px;letter-spacing:0.4px;color:${COLORS.muted};">${escapeHtml(vendor.tag_line)}</td></tr>`
                  : ""
              }
              <tr><td style="padding:24px 32px 0;"><div style="height:1px;background:${COLORS.border};font-size:0;line-height:0;">&nbsp;</div></td></tr>

              <!-- Message -->
              <tr>
                <td style="padding:28px 40px 0;font-family:${FONT};">
                  <h1 style="margin:0 0 12px;font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.4px;color:${COLORS.primary};">Your sign-in code</h1>
                  <p style="margin:0;font-size:15px;line-height:24px;color:${COLORS.primary};">Hi ${greetingName},</p>
                  <p style="margin:8px 0 0;font-size:15px;line-height:24px;color:${COLORS.primary};">Use the code below to sign in to the <strong>${vendorName}</strong> app and follow your project.</p>
                </td>
              </tr>

              <!-- Code -->
              <tr>
                <td align="center" style="padding:28px 24px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.codeBg};border-radius:16px;">
                    <tr>
                      <td style="padding:20px;">
                        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${digits}</tr></table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:14px 32px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">
                  This code expires in <strong style="color:${COLORS.secondary};">${minutes} minutes</strong>.
                </td>
              </tr>

              <!-- Security note -->
              <tr>
                <td style="padding:28px 40px 36px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:3px solid ${COLORS.secondary};background:#FAF7F5;border-radius:0 10px 10px 0;">
                    <tr>
                      <td style="padding:14px 16px;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.primary};">
                        <strong>Keep this code private.</strong> ${vendorName} will never ask you for it. If you didn’t try to sign in, you can safely ignore this email.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td align="center" style="background:${COLORS.primary};padding:24px 32px;font-family:${FONT};">
                  <p style="margin:0;font-size:15px;font-weight:700;color:#FFFFFF;">${vendorName}</p>
                  ${location ? `<p style="margin:6px 0 0;font-size:12px;line-height:18px;color:rgba(255,255,255,0.75);">${escapeHtml(location)}</p>` : ""}
                  ${
                    contactLinks.length
                      ? `<p style="margin:10px 0 0;font-size:12px;line-height:18px;color:rgba(255,255,255,0.75);">${contactLinks.join(`&nbsp;&nbsp;·&nbsp;&nbsp;`)}</p>`
                      : ""
                  }
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:20px 24px 0;font-family:${FONT};font-size:11px;line-height:17px;color:${COLORS.muted};">
            This is an automated message sent because a sign-in was requested for this email address.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    `Hi ${clientName || "there"},`,
    "",
    `Your ${vendor.vendor_name} sign-in code is ${otp}.`,
    `It expires in ${minutes} minutes.`,
    "",
    `Keep this code private. ${vendor.vendor_name} will never ask you for it. If you didn't try to sign in, you can ignore this email.`,
  ].join("\n");

  return {
    subject: `${otp} is your ${vendor.vendor_name} sign-in code`,
    html,
    text,
  };
}
