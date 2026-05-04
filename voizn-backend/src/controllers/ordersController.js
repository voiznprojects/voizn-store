import { UserRole } from "@prisma/client";
import {
  createOrderForUser,
  getOrderDetails,
  listOrdersForUser,
} from "../services/orderService.js";
import { asyncHandler, jsonError } from "../utils/http.js";

export const createOrder = asyncHandler(async (request, response) => {
  const { items, discountCode, totalAmount, currency, deliveryDate } = request.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    jsonError(response, 400, "Order items are required.", "validation_error");
    return;
  }

  if (totalAmount == null || Number.isNaN(Number(totalAmount))) {
    jsonError(response, 400, "A valid total amount is required.", "validation_error");
    return;
  }

  const normalizedItems = items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId || null,
    productName: item.productName,
    variant: item.variant || null,
    color: item.color || null,
    size: item.size || null,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
  }));

  if (
    normalizedItems.some(
      (item) =>
        !item.productId ||
        !item.productName ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        !Number.isFinite(item.unitPrice),
    )
  ) {
    jsonError(response, 400, "Order items are invalid.", "validation_error");
    return;
  }

  const order = await createOrderForUser({
    userId: request.user.id,
    items: normalizedItems,
    discountCode,
    totalAmount: Number(totalAmount),
    currency: currency || "GBP",
    deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
  });

  response.status(201).json({ ok: true, order });
});

export const getOrders = asyncHandler(async (request, response) => {
  const orders = await listOrdersForUser(request.user);
  response.json({ ok: true, orders });
});

export const getOrder = asyncHandler(async (request, response) => {
  const orderNumber = Number(request.params.orderNumber);
  if (!Number.isFinite(orderNumber)) {
    jsonError(response, 400, "Order number is invalid.", "validation_error");
    return;
  }

  const order = await getOrderDetails(orderNumber);
  if (!order) {
    jsonError(response, 404, "Order not found.", "not_found");
    return;
  }

  if (request.user.role !== UserRole.ADMIN && order.userId !== request.user.id) {
    jsonError(response, 403, "You do not have access to this order.", "forbidden");
    return;
  }

  response.json({ ok: true, order });
});
