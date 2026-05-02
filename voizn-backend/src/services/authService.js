import { AccessStatus, LoginMethod, VerificationPurpose } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import {
  sendApprovalEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../utils/email.js";
import { signPurposeToken, signToken, verifyToken } from "../utils/jwt.js";
import { compareValue, createNumericCode, hashValue } from "../utils/security.js";
import { sanitizeUser } from "./userService.js";

const SIGNUP_CODE_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_CODE_TTL_MS = 10 * 60 * 1000;

export async function startSignup({ name, email, country }) {
  const normalizedEmail = String(email).trim().toLowerCase();

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      name,
      country: country || null,
      accessStatus: AccessStatus.PENDING_VERIFICATION,
      loginMethod: LoginMethod.EMAIL,
      isEmailVerified: false,
      passwordHash: null,
    },
    create: {
      name,
      email: normalizedEmail,
      country: country || null,
      accessStatus: AccessStatus.PENDING_VERIFICATION,
      loginMethod: LoginMethod.EMAIL,
      isEmailVerified: false,
    },
  });

  await prisma.verificationCode.updateMany({
    where: {
      userId: user.id,
      purpose: VerificationPurpose.SIGNUP,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });

  const code = createNumericCode();
  await prisma.verificationCode.create({
    data: {
      userId: user.id,
      codeHash: await hashValue(code),
      purpose: VerificationPurpose.SIGNUP,
      expiresAt: new Date(Date.now() + SIGNUP_CODE_TTL_MS),
    },
  });

  await sendVerificationEmail(normalizedEmail, code);

  return {
    ok: true,
    message: "Verification code sent.",
  };
}

export async function verifySignupCode({ email, code }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      verificationCodes: {
        where: {
          purpose: VerificationPurpose.SIGNUP,
          consumedAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const verificationCode = user?.verificationCodes?.[0];
  if (!user || !verificationCode) {
    const error = new Error("Verification code could not be found.");
    error.statusCode = 400;
    error.code = "invalid_code";
    throw error;
  }

  if (verificationCode.expiresAt.getTime() < Date.now()) {
    const error = new Error("Verification code has expired.");
    error.statusCode = 400;
    error.code = "expired_code";
    throw error;
  }

  const isValid = await compareValue(String(code).trim(), verificationCode.codeHash);
  if (!isValid) {
    const error = new Error("Verification code is incorrect.");
    error.statusCode = 400;
    error.code = "invalid_code";
    throw error;
  }

  await prisma.$transaction([
    prisma.verificationCode.update({
      where: { id: verificationCode.id },
      data: { consumedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        accessStatus: AccessStatus.PENDING_APPROVAL,
      },
    }),
  ]);

  return {
    ok: true,
    setupToken: signPurposeToken(
      { sub: user.id, purpose: "password-setup" },
      "20m",
    ),
  };
}

export async function setPasswordAfterVerification({ setupToken, password }) {
  let tokenPayload;

  try {
    tokenPayload = verifyToken(setupToken);
  } catch {
    const error = new Error("Password setup token is invalid or expired.");
    error.statusCode = 400;
    error.code = "invalid_token";
    throw error;
  }

  if (tokenPayload.purpose !== "password-setup") {
    const error = new Error("Password setup token is invalid.");
    error.statusCode = 400;
    error.code = "invalid_token";
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { id: tokenPayload.sub },
  });

  if (!user?.isEmailVerified) {
    const error = new Error("Verify your email before setting a password.");
    error.statusCode = 403;
    error.code = "email_not_verified";
    throw error;
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashValue(password),
      accessStatus: AccessStatus.PENDING_APPROVAL,
      loginMethod: LoginMethod.EMAIL,
    },
  });

  return {
    ok: true,
    message:
      "Account created. Your access request is now pending manual approval from VOIZN.",
    user: sanitizeUser(updatedUser),
  };
}

export async function loginWithEmailPassword({ email, password }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user?.passwordHash) {
    const error = new Error("Incorrect email or password.");
    error.statusCode = 401;
    error.code = "invalid_credentials";
    throw error;
  }

  const isValidPassword = await compareValue(password, user.passwordHash);
  if (!isValidPassword) {
    const error = new Error("Incorrect email or password.");
    error.statusCode = 401;
    error.code = "invalid_credentials";
    throw error;
  }

  if (!user.isEmailVerified) {
    const error = new Error("Verify your email before logging in.");
    error.statusCode = 403;
    error.code = "email_not_verified";
    throw error;
  }

  if (user.accessStatus !== AccessStatus.APPROVED) {
    const error = new Error(
      user.accessStatus === AccessStatus.PENDING_APPROVAL
        ? "Your account is waiting for manual approval."
        : "Your account does not currently have access.",
    );
    error.statusCode = 403;
    error.code = "access_not_approved";
    throw error;
  }

  return {
    ok: true,
    token: signToken(user),
    user: sanitizeUser(user),
  };
}

export async function startPasswordReset({ email }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    return {
      ok: true,
      message: "If that email exists, a reset code has been sent.",
    };
  }

  const resetToken = signPurposeToken(
    { sub: user.id, purpose: "password-reset" },
    "20m",
  );
  const resetUrl = `${env.frontendBaseUrl.replace(/\/$/, "")}/reset-password.html?token=${encodeURIComponent(resetToken)}`;

  await sendPasswordResetEmail(normalizedEmail, resetUrl);

  return {
    ok: true,
    message: "If that email exists, a reset link has been sent.",
  };
}

export async function verifyPasswordResetCode({ email, code }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: {
      verificationCodes: {
        where: {
          purpose: VerificationPurpose.PASSWORD_RESET,
          consumedAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const verificationCode = user?.verificationCodes?.[0];
  if (!user || !verificationCode) {
    const error = new Error("Reset code could not be found.");
    error.statusCode = 400;
    error.code = "invalid_code";
    throw error;
  }

  if (verificationCode.expiresAt.getTime() < Date.now()) {
    const error = new Error("Reset code has expired.");
    error.statusCode = 400;
    error.code = "expired_code";
    throw error;
  }

  const isValid = await compareValue(String(code).trim(), verificationCode.codeHash);
  if (!isValid) {
    const error = new Error("Reset code is incorrect.");
    error.statusCode = 400;
    error.code = "invalid_code";
    throw error;
  }

  await prisma.verificationCode.update({
    where: { id: verificationCode.id },
    data: { consumedAt: new Date() },
  });

  return {
    ok: true,
    resetToken: signPurposeToken(
      { sub: user.id, purpose: "password-reset" },
      "20m",
    ),
  };
}

export async function resetPassword({ resetToken, password }) {
  let tokenPayload;

  try {
    tokenPayload = verifyToken(resetToken);
  } catch {
    const error = new Error("Password reset token is invalid or expired.");
    error.statusCode = 400;
    error.code = "invalid_token";
    throw error;
  }

  if (tokenPayload.purpose !== "password-reset") {
    const error = new Error("Password reset token is invalid.");
    error.statusCode = 400;
    error.code = "invalid_token";
    throw error;
  }

  const updatedUser = await prisma.user.update({
    where: { id: tokenPayload.sub },
    data: {
      passwordHash: await hashValue(password),
      loginMethod: LoginMethod.EMAIL,
    },
  });

  return {
    ok: true,
    message: "Your password has been updated. You can sign in now.",
    user: sanitizeUser(updatedUser),
  };
}

export async function approveUser({ userId, adminUserId }) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      accessStatus: AccessStatus.APPROVED,
      approvedAt: new Date(),
      approvedById: adminUserId,
    },
  });

  await sendApprovalEmail(user.email);

  return {
    ok: true,
    user: sanitizeUser(user),
  };
}

export async function rejectUser({ userId }) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      accessStatus: AccessStatus.REJECTED,
    },
  });

  return {
    ok: true,
    user: sanitizeUser(user),
  };
}
