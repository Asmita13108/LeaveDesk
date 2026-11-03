const nodemailer = require("nodemailer");

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);

const sendEmail = async ({ to, subject, text }) => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;

  if (!host || !user || !password || !from || !Number.isInteger(port) || port < 1) {
    console.warn("Email notification skipped: SMTP settings are incomplete.");
    return false;
  }

  if (typeof to !== "string" || !to.trim()) {
    console.error("Email notification skipped: recipient email is missing.");
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: { user, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#25344a">${escapeHtml(text).replace(/\r?\n/g, "<br>")}</div>`
    });
    return true;
  } catch (error) {
    console.error("Email notification failed:", error.message);
    return false;
  }
};

module.exports = sendEmail;
