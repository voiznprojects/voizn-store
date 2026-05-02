import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transporter =
  env.smtp.host && env.smtp.port && env.smtp.user && env.smtp.pass
    ? nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        auth: {
          user: env.smtp.user,
          pass: env.smtp.pass,
        },
      })
    : null;

async function deliverEmail({ to, subject, text, html }) {
  if (!transporter) {
    console.log("[voizn-mail-fallback]", { to, subject, text });
    return { delivered: false, preview: text };
  }

  await transporter.sendMail({
    from: env.emailFrom,
    to,
    subject,
    text,
    html,
  });

  return { delivered: true };
}

export function sendVerificationEmail(email, code) {
  return deliverEmail({
    to: email,
    subject: "Your VOIZN verification code",
    text: `Your VOIZN verification code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your VOIZN verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
}

export function sendApprovalEmail(email) {
  return deliverEmail({
    to: email,
    subject: "You now have access to Voizn",
    text: "Your VOIZN account is now approved. You can sign in to the private website.",
    html: "<p>Your VOIZN account is now approved.</p><p>You can sign in to the private website.</p>",
  });
}

export function sendPasswordResetEmail(email, resetUrl) {
  return deliverEmail({
    to: email,
    subject: "Reset your VOIZN password",
    text: `Open this link to reset your VOIZN password: ${resetUrl}\n\nThis link expires in 20 minutes.`,
    html: `<p>Open the link below to reset your VOIZN password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 20 minutes.</p>`,
  });
}
