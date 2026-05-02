import { AccessStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../utils/jwt.js";
import { jsonError } from "../utils/http.js";

function readToken(request) {
  const bearer = request.headers.authorization;
  if (bearer?.startsWith("Bearer ")) {
    return bearer.slice(7).trim();
  }

  return request.cookies?.voizn_session || null;
}

export async function attachCurrentUser(request, response, next) {
  const token = readToken(request);
  if (!token) {
    request.auth = null;
    request.user = null;
    next();
    return;
  }

  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId || payload.sub },
    });

    if (!user) {
      request.auth = null;
      request.user = null;
      next();
      return;
    }

    request.auth = payload;
    request.user = user;
    next();
  } catch {
    request.auth = null;
    request.user = null;
    next();
  }
}

export function requireAuth(request, response, next) {
  if (!request.user) {
    jsonError(response, 401, "You must log in to continue.", "unauthenticated");
    return;
  }

  if (!request.user.isEmailVerified) {
    jsonError(response, 403, "Verify your email before continuing.", "email_not_verified");
    return;
  }

  if (request.user.accessStatus !== AccessStatus.APPROVED) {
    jsonError(
      response,
      403,
      "Your account does not currently have website access.",
      "access_not_approved",
    );
    return;
  }

  next();
}

export function requireAdmin(request, response, next) {
  if (!request.user) {
    jsonError(response, 401, "You must log in to continue.", "unauthenticated");
    return;
  }

  if (request.user.role !== UserRole.ADMIN) {
    jsonError(response, 403, "Admin access required.", "forbidden");
    return;
  }

  next();
}
