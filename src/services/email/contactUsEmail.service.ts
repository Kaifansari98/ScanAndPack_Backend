import logger from "../../utils/logger";
import { prisma } from "../../prisma/client";
import { sendBrevoEmail } from "./brevoEmail.service";

export type ContactUsPayload = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

const CONTACT_TO_EMAIL =
  process.env.VLOQ_CONTACT_TO_EMAIL || "vloq.info@gmail.com";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const sendContactUsEmail = async (payload: ContactUsPayload) => {
  const subject = payload.subject?.trim() || "Contact Us Message";
  const name = payload.name?.trim();
  const email = payload.email?.trim();
  const message = payload.message?.trim();

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <table style="border-collapse: collapse;">
        <tr><td style="padding: 4px 8px; font-weight: 600;">Name</td><td style="padding: 4px 8px;">${safeName}</td></tr>
        <tr><td style="padding: 4px 8px; font-weight: 600;">Email</td><td style="padding: 4px 8px;">${safeEmail}</td></tr>
        <tr><td style="padding: 4px 8px; font-weight: 600;">Subject</td><td style="padding: 4px 8px;">${safeSubject}</td></tr>
        <tr><td style="padding: 4px 8px; font-weight: 600;">Message</td><td style="padding: 4px 8px;">${safeMessage}</td></tr>
      </table>
    </div>
  `;

  const text = [
    "New Contact Us Message",
    `Name: ${name}`,
    `Email: ${email}`,
    `Subject: ${subject}`,
    "Message:",
    message,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await sendBrevoEmail(
    {
      toEmail: CONTACT_TO_EMAIL,
      toName: "VLOQ Support",
      subject: `[Contact Us] ${subject}`,
      html,
      text,
      replyToEmail: email, // user who filled the form
      replyToName: name,
    },
    {
      senderName: "VLOQ Support", // ← Company Name
      senderEmail: "vloqinfo@gmail.com", // ← Your verified Brevo email
    },
  );

  const status = result.success
    ? "sent"
    : "skipped" in result
      ? "skipped"
      : "failed";

  const errorMessage =
    "error" in result
      ? result.error
      : "reason" in result
        ? result.reason
        : null;

  try {
    await prisma.vloqEmailLogs.create({
      data: {
        name,
        email,
        subject,
        message,
        to_email: CONTACT_TO_EMAIL,
        status,
        error_message: errorMessage,
      },
    });
  } catch (dbError: any) {
    logger.warn("[ContactUs] Failed to persist email log", {
      error: dbError?.message,
    });
  }

  if (!result.success && !("skipped" in result)) {
    logger.warn("[ContactUs] Email send failed", {
      to: CONTACT_TO_EMAIL,
      status: result.status,
      error: result.error,
    });
  }

  return result;
};
