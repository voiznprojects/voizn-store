import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import {
  approveUser,
  loginWithEmailPassword,
  rejectUser,
  resendSignupCode,
  resetPassword,
  setPasswordAfterVerification,
  startPasswordReset,
  startSignup,
  verifySignupCode,
} from "../services/authService.js";
import { sanitizeUser } from "../services/userService.js";
import { asyncHandler, jsonError } from "../utils/http.js";

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setSessionCookie(response, token) {
  response.cookie("voizn_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: !["127.0.0.1", "localhost"].includes(new URL(env.frontendBaseUrl).hostname),
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export const signupStart = asyncHandler(async (request, response) => {
  const { name, email, country } = request.body || {};
  if (!name || !email) {
    jsonError(response, 400, "Name and email are required.", "validation_error");
    return;
  }

  const result = await startSignup({ name, email, country });
  response.json(result);
});

export const signupVerifyCode = asyncHandler(async (request, response) => {
  const { email, code } = request.body || {};
  if (!email || !code) {
    jsonError(response, 400, "Email and verification code are required.", "validation_error");
    return;
  }

  const result = await verifySignupCode({ email, code });
  response.json(result);
});

export const signupResendCode = asyncHandler(async (request, response) => {
  const { email } = request.body || {};
  if (!email) {
    jsonError(response, 400, "Email is required.", "validation_error");
    return;
  }

  const result = await resendSignupCode({ email });
  response.json(result);
});

export const signupSetPassword = asyncHandler(async (request, response) => {
  const { setupToken, password } = request.body || {};
  if (!setupToken || !password || String(password).length < 8) {
    jsonError(
      response,
      400,
      "A password with at least 8 characters is required.",
      "validation_error",
    );
    return;
  }

  const result = await setPasswordAfterVerification({ setupToken, password });
  response.json(result);
});

export const passwordResetStart = asyncHandler(async (request, response) => {
  const { email } = request.body || {};
  if (!email) {
    jsonError(response, 400, "Email is required.", "validation_error");
    return;
  }

  const result = await startPasswordReset({ email });
  response.json(result);
});

export const passwordResetComplete = asyncHandler(async (request, response) => {
  const { resetToken, password } = request.body || {};
  if (!resetToken || !password || String(password).length < 8) {
    jsonError(
      response,
      400,
      "A password with at least 8 characters is required.",
      "validation_error",
    );
    return;
  }

  const result = await resetPassword({ resetToken, password });
  response.json(result);
});

export const login = asyncHandler(async (request, response) => {
  const { email, password } = request.body || {};
  if (!email || !password) {
    jsonError(response, 400, "Email and password are required.", "validation_error");
    return;
  }

  const result = await loginWithEmailPassword({ email, password });
  setSessionCookie(response, result.token);
  response.json(result);
});

export function logout(_request, response) {
  response.clearCookie("voizn_session");
  response.json({ ok: true });
}

export const me = asyncHandler(async (request, response) => {
  const [favoritesCount, ordersCount] = await Promise.all([
    prisma.favorite.count({ where: { userId: request.user.id } }),
    prisma.order.count({ where: { userId: request.user.id } }),
  ]);

  response.json({
    ok: true,
    user: {
      ...sanitizeUser(request.user),
      favoritesCount,
      ordersCount,
    },
  });
});

export const approvePendingUser = asyncHandler(async (request, response) => {
  const targetUserId = request.body?.userId || request.params?.id;
  if (!targetUserId) {
    jsonError(response, 400, "User id is required.", "validation_error");
    return;
  }

  const result = await approveUser({
    userId: targetUserId,
    adminUserId: request.user.id,
  });

  response.json(result);
});

export const rejectPendingUser = asyncHandler(async (request, response) => {
  const targetUserId = request.body?.userId || request.params?.id;
  if (!targetUserId) {
    jsonError(response, 400, "User id is required.", "validation_error");
    return;
  }

  const result = await rejectUser({ userId: targetUserId });
  response.json(result);
});
