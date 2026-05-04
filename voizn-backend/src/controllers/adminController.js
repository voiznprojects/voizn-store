import { AccessStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { updateDrop, updateVariantStock } from "../services/catalogService.js";
import {
  getAdminAnalyticsActivity as loadAdminAnalyticsActivity,
  getAdminAnalyticsProducts as loadAdminAnalyticsProducts,
  getAdminAnalyticsSummary as loadAdminAnalyticsSummary,
} from "../services/adminAnalyticsService.js";
import { sanitizeUser } from "../services/userService.js";
import { updateOrderStatus } from "../services/orderService.js";
import { asyncHandler, jsonError } from "../utils/http.js";

export const listPendingAccessUsers = asyncHandler(async (_request, response) => {
  const pendingUsers = await prisma.user.findMany({
    where: {
      accessStatus: AccessStatus.PENDING_APPROVAL,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  response.json({
    ok: true,
    pendingUsers: pendingUsers.map(sanitizeUser),
  });
});

export const getAdminAnalytics = asyncHandler(async (request, response) => {
  const analytics = await loadAdminAnalyticsSummary(request.query || {});
  response.json({ ok: true, analytics });
});

export const getAdminAnalyticsSummary = asyncHandler(async (request, response) => {
  const summary = await loadAdminAnalyticsSummary(request.query || {});
  response.json({ ok: true, summary });
});

export const getAdminAnalyticsActivity = asyncHandler(async (request, response) => {
  const activity = await loadAdminAnalyticsActivity(request.query || {});
  response.json({ ok: true, activity });
});

export const getAdminAnalyticsProducts = asyncHandler(async (request, response) => {
  const products = await loadAdminAnalyticsProducts(request.query || {});
  response.json({ ok: true, products });
});

export const patchOrderStatus = asyncHandler(async (request, response) => {
  const orderNumber = Number(request.params.orderNumber);
  const { status, trackingNumber, deliveryDate } = request.body || {};

  if (!Number.isFinite(orderNumber) || !status) {
    jsonError(response, 400, "Order number and status are required.", "validation_error");
    return;
  }

  const order = await updateOrderStatus({
    orderNumber,
    status,
    trackingNumber: trackingNumber || null,
    deliveryDate: deliveryDate || null,
  });

  response.json({ ok: true, order });
});

export const patchVariantStock = asyncHandler(async (request, response) => {
  const { stock } = request.body || {};
  if (!Number.isFinite(Number(stock))) {
    jsonError(response, 400, "A valid stock number is required.", "validation_error");
    return;
  }

  const variant = await updateVariantStock({
    variantId: request.params.variantId,
    stock: Number(stock),
  });

  response.json({ ok: true, variant });
});

export const patchDrop = asyncHandler(async (request, response) => {
  const drop = await updateDrop(request.params.dropId, request.body || {});
  response.json({ ok: true, drop });
});
