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
const LOGIN_LOCKOUT_WINDOWS_MS = [
  60 * 1000,
  3 * 60 * 1000,
  5 * 60 * 1000,
  2 * 60 * 60 * 1000,
];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createLoginThrottleError(lockedUntil, lockoutsTriggered) {
  const error = new Error(
    lockoutsTriggered >= LOGIN_LOCKOUT_WINDOWS_MS.length
      ? "Too many login attempts. Try again later. Access will unlock after 2 hours."
      : `Too many login attempts. Try again in ${Math.max(
          1,
          Math.ceil((lockedUntil.getTime() - Date.now()) / 60000),
        )} minute${Math.ceil((lockedUntil.getTime() - Date.now()) / 60000) === 1 ? "" : "s"}.`,
  );
  error.statusCode = 429;
  error.code = "login_rate_limited";
  error.retryAfterSeconds = Math.max(
    1,
    Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
  );
  return error;
}

async function enforceLoginThrottle({ email, ipAddress }) {
  const throttle = await prisma.loginThrottle.findUnique({
    where: {
      email_ipAddress: {
        email,
        ipAddress,
      },
    },
  });

  if (!throttle) {
    return;
  }

  if (throttle.lockedUntil && throttle.lockedUntil.getTime() > Date.now()) {
    throw createLoginThrottleError(
      throttle.lockedUntil,
      throttle.lockoutsTriggered,
    );
  }

  if (throttle.lockedUntil) {
    await prisma.loginThrottle.update({
      where: {
        email_ipAddress: {
          email,
          ipAddress,
        },
      },
      data: {
        lockedUntil: null,
        failedAttempts: 0,
      },
    });
  }
}

async function clearLoginThrottle({ email, ipAddress }) {
  await prisma.loginThrottle.deleteMany({
    where: {
      email,
      ipAddress,
    },
  });
}

async function recordFailedLoginAttempt({ email, ipAddress }) {
  const now = new Date();
  const throttle = await prisma.loginThrottle.upsert({
    where: {
      email_ipAddress: {
        email,
        ipAddress,
      },
    },
    create: {
      email,
      ipAddress,
      failedAttempts: 1,
      lastAttemptAt: now,
    },
    update: {
      failedAttempts: {
        increment: 1,
      },
      lastAttemptAt: now,
    },
  });

  if (throttle.failedAttempts < 5) {
    return {
      failedAttempts: throttle.failedAttempts,
      remainingAttempts: Math.max(0, 5 - throttle.failedAttempts),
    };
  }

  const stageIndex = Math.min(
    throttle.lockoutsTriggered,
    LOGIN_LOCKOUT_WINDOWS_MS.length - 1,
  );
  const lockDurationMs = LOGIN_LOCKOUT_WINDOWS_MS[stageIndex];
  const lockedUntil = new Date(Date.now() + lockDurationMs);
  const updatedThrottle = await prisma.loginThrottle.update({
    where: {
      email_ipAddress: {
        email,
        ipAddress,
      },
    },
    data: {
      failedAttempts: 0,
      lockoutsTriggered: {
        increment: 1,
      },
      lockedUntil,
      lastAttemptAt: now,
    },
  });

  throw createLoginThrottleError(
    lockedUntil,
    updatedThrottle.lockoutsTriggered,
  );
}

export async function startSignup({ name, email, country }) {
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingUser) {
    const error = new Error("An account with this email already exists.");
    error.statusCode = 409;
    error.code = "email_exists";
    throw error;
  }

  const user = await prisma.user.create({
    data: {
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

export async function resendSignupCode({ email }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || user.isEmailVerified || user.accessStatus !== AccessStatus.PENDING_VERIFICATION) {
    const error = new Error("A verification code cannot be resent for this account.");
    error.statusCode = 400;
    error.code = "cannot_resend_code";
    throw error;
  }

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
    message: "A fresh verification code has been sent.",
  };
}

export async function verifySignupCode({ email, code }) {
  const normalizedEmail = normalizeEmail(email);
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

export async function loginWithEmailPassword({ email, password, ipAddress }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedIp = String(ipAddress || "unknown").trim().slice(0, 255) || "unknown";

  await enforceLoginThrottle({
    email: normalizedEmail,
    ipAddress: normalizedIp,
  });

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user?.passwordHash) {
    const attemptState = await recordFailedLoginAttempt({
      email: normalizedEmail,
      ipAddress: normalizedIp,
    });
    const error = new Error("Incorrect email or password.");
    error.statusCode = 401;
    error.code = "invalid_credentials";
    if (attemptState) {
      error.remainingAttempts = attemptState.remainingAttempts;
      error.message = `Incorrect email or password. ${attemptState.remainingAttempts} attempt${attemptState.remainingAttempts === 1 ? "" : "s"} left before cooldown.`;
    }
    throw error;
  }

  const isValidPassword = await compareValue(password, user.passwordHash);
  if (!isValidPassword) {
    const attemptState = await recordFailedLoginAttempt({
      email: normalizedEmail,
      ipAddress: normalizedIp,
    });
    const error = new Error("Incorrect email or password.");
    error.statusCode = 401;
    error.code = "invalid_credentials";
    if (attemptState) {
      error.remainingAttempts = attemptState.remainingAttempts;
      error.message = `Incorrect email or password. ${attemptState.remainingAttempts} attempt${attemptState.remainingAttempts === 1 ? "" : "s"} left before cooldown.`;
    }
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

  await clearLoginThrottle({
    email: normalizedEmail,
    ipAddress: normalizedIp,
  });

  return {
    ok: true,
    token: signToken(user),
    user: sanitizeUser(user),
  };
}

export async function startPasswordReset({ email }) {
  const normalizedEmail = normalizeEmail(email);
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
  const resetUrl = `${env.frontendBaseUrl.replace(/\/$/, "")}/reset-password/?token=${encodeURIComponent(resetToken)}`;

  await sendPasswordResetEmail(normalizedEmail, resetUrl);

  return {
    ok: true,
    message: "If that email exists, a reset link has been sent.",
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
