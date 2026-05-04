import "dotenv/config";

export const env = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "voizn-dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  emailFrom:
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    "contact@voizn.store",
  resendApiKey: process.env.RESEND_API_KEY || "",
  frontendOrigins: (
    process.env.FRONTEND_ORIGINS ||
    "http://127.0.0.1:8080,http://localhost:8080,https://voizn.store,https://www.voizn.store"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  frontendBaseUrl:
    process.env.FRONTEND_BASE_URL ||
    process.env.FRONTEND_URL ||
    "http://127.0.0.1:5500",
};

export function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (env.frontendOrigins.includes(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}
