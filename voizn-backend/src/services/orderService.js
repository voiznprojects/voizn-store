import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export async function createOrderForUser({
  userId,
  items,
  discountCode,
  totalAmount,
  currency = "GBP",
  deliveryDate = null,
}) {
  return prisma.$transaction(async (tx) => {
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
            productName: item.productName,
            variant: item.variant || null,
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
