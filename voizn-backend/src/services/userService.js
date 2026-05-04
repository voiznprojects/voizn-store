import { AccessStatus, LoginMethod, OrderStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    country: user.country,
    accessStatus: user.accessStatus,
    role: user.role,
    loginMethod: user.loginMethod,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    approvedAt: user.approvedAt,
  };
}

export async function ensureSeedData() {
  const admin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
    orderBy: [{ approvedAt: "desc" }, { createdAt: "asc" }],
  });

  if (!admin) {
    console.warn("[voizn-seed] No admin user exists. Skipping test order seed.");
    return;
  }

  const existingOrders = await prisma.order.count();
  if (existingOrders > 0) {
    return;
  }

  await prisma.order.create({
    data: {
      userId: admin.id,
      orderNumber: 1,
      status: OrderStatus.DELIVERED,
      discountCode: "VOIZNADMIN",
      purchaseDate: new Date("2026-04-29T12:12:00.000Z"),
      deliveryDate: new Date("2026-05-03T10:30:00.000Z"),
      shippedAt: new Date("2026-04-30T09:00:00.000Z"),
      deliveredAt: new Date("2026-05-03T10:30:00.000Z"),
      trackingNumber: "VOIZN-TRACK-0001",
      totalAmount: 178,
      currency: "GBP",
      items: {
        create: [
          {
            productId: "ghostline-hoodie",
            productName: "Ghostline Hoodie",
            variant: "Black / M",
            color: "Black",
            size: "M",
            quantity: 1,
            unitPrice: 78,
          },
          {
            productId: "signal-tee",
            productName: "Signal Tee",
            variant: "White / L",
            color: "White",
            size: "L",
            quantity: 1,
            unitPrice: 34,
          },
          {
            productId: "silent-short",
            productName: "Silent Short",
            variant: "Black / M",
            color: "Black",
            size: "M",
            quantity: 1,
            unitPrice: 66,
          },
        ],
      },
    },
  });
}
