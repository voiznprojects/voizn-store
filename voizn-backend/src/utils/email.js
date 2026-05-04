import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "../config/env.js";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

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
  if (resend) {
    const result = await resend.emails.send({
      from: env.emailFrom,
      to,
      subject,
      text,
      html,
    });

    if (result?.error) {
      throw new Error(result.error.message || "Resend failed to deliver the email.");
    }

    console.log("[voizn-mail-sent]", {
      provider: "resend",
      to,
      subject,
      id: result?.data?.id || null,
    });

    return { delivered: true, provider: "resend", result };
  }

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

  console.log("[voizn-mail-sent]", {
    provider: "smtp",
    to,
    subject,
  });

  return { delivered: true, provider: "smtp" };
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

export function sendOrderConfirmationEmail(email, order) {
  return deliverEmail({
    to: email,
    subject: `VOIZN order confirmed #${order.orderNumber}`,
    text: `Your VOIZN order #${order.orderNumber} is confirmed. Total: ${order.currency} ${order.totalAmount}.`,
    html: `<p>Your VOIZN order <strong>#${order.orderNumber}</strong> is confirmed.</p><p>Total: ${order.currency} ${order.totalAmount}</p>`,
  });
}

export function sendOrderShippedEmail(email, order) {
  const trackingLine = order.trackingNumber
    ? `Tracking number: ${order.trackingNumber}`
    : "Tracking information will be shared once it is available.";

  return deliverEmail({
    to: email,
    subject: `Your VOIZN order #${order.orderNumber} has shipped`,
    text: `Your VOIZN order #${order.orderNumber} is now shipped. ${trackingLine}`,
    html: `<p>Your VOIZN order <strong>#${order.orderNumber}</strong> is now shipped.</p><p>${trackingLine}</p>`,
  });
}

export function sendBackInStockEmail(email, productName, variantLabel) {
  return deliverEmail({
    to: email,
    subject: `${productName} is back in stock`,
    text: `${productName}${variantLabel ? ` (${variantLabel})` : ""} is now back in stock on VOIZN.`,
    html: `<p><strong>${productName}</strong>${variantLabel ? ` (${variantLabel})` : ""} is now back in stock on VOIZN.</p>`,
  });
}

export function sendDropNotificationEmail(email, drop) {
  return deliverEmail({
    to: email,
    subject: `${drop.title} is now live on VOIZN`,
    text: `${drop.title} is now live on VOIZN. ${drop.description || ""}`.trim(),
    html: `<p><strong>${drop.title}</strong> is now live on VOIZN.</p><p>${drop.description || ""}</p>`,
  });
}
