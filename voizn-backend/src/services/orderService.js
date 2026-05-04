import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  sendOrderConfirmationEmail,
  sendOrderShippedEmail,
} from "../utils/email.js";

export async function createOrderForUser({
  userId,
  items,
  discountCode,
  totalAmount,
  currency = "GBP",
  deliveryDate = null,
}) {
  const order = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4172026)`;

    const [{ nextOrderNumber }] = await tx.$queryRaw`
      SELECT COALESCE(MAX("orderNumber"), 0) + 1 AS "nextOrderNumber"
      FROM "Order"
    `;

    const order = await tx.order.create({
      data: {
        userId,
        orderNumber: Number(nextOrderNumber),
        discountCode: discountCode || null,
        totalAmount: new Prisma.Decimal(totalAmount),
        currency,
        deliveryDate,
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId || null,
            productName: item.productName,
            variant: item.variant || null,
            color: item.color || null,
            size: item.size || null,
            quantity: Number(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
          })),
        },
      },
      include: {
        items: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return order;
  });

  if (order.user?.email) {
    await sendOrderConfirmationEmail(order.user.email, order);
  }

  return order;
}

export function listOrdersForUser(user) {
  const where = user.role === "ADMIN" ? {} : { userId: user.id };

  return prisma.order.findMany({
    where,
    orderBy: { orderNumber: "desc" },
    include: {
      items: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });
}

export function getOrderDetails(orderNumber) {
  return prisma.order.findUnique({
    where: { orderNumber: Number(orderNumber) },
    include: {
      items: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });
}

export async function updateOrderStatus({
  orderNumber,
  status,
  trackingNumber = null,
  deliveryDate = null,
}) {
  const normalizedStatus = String(status).toUpperCase();
  if (!OrderStatus[normalizedStatus]) {
    const error = new Error("Order status is invalid.");
    error.statusCode = 400;
    error.code = "invalid_status";
    throw error;
  }

  const existingOrder = await prisma.order.findUnique({
    where: { orderNumber: Number(orderNumber) },
    include: {
      user: {
        select: {
          email: true,
          name: true,
        },
      },
      items: true,
    },
  });

  if (!existingOrder) {
    const error = new Error("Order not found.");
    error.statusCode = 404;
    error.code = "not_found";
    throw error;
  }

  const data = {
    status: normalizedStatus,
    trackingNumber,
  };

  if (normalizedStatus === OrderStatus.SHIPPED) {
    data.shippedAt = new Date();
  }

  if (normalizedStatus === OrderStatus.DELIVERED) {
    data.deliveredAt = new Date();
  }

  if (deliveryDate) {
    data.deliveryDate = new Date(deliveryDate);
  }

  const order = await prisma.order.update({
    where: { orderNumber: Number(orderNumber) },
    data,
    include: {
      items: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (
    normalizedStatus === OrderStatus.SHIPPED &&
    existingOrder.status !== OrderStatus.SHIPPED &&
    order.user?.email
  ) {
    await sendOrderShippedEmail(order.user.email, order);
  }

  return order;
}
