import { AccessStatus, LoginMethod, OrderStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashValue } from "../utils/security.js";

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
  const adminEmail = process.env.ADMIN_EMAIL || "voiznadmin@voizn.store";
  const adminPassword = process.env.ADMIN_PASSWORD || "Access2026!";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      email: adminEmail,
      passwordHash: await hashValue(adminPassword),
      role: UserRole.ADMIN,
      accessStatus: AccessStatus.APPROVED,
      isEmailVerified: true,
      loginMethod: LoginMethod.EMAIL,
      name: "voiznowner",
      country: "United Kingdom",
      approvedAt: new Date(),
    },
    create: {
      email: adminEmail,
      name: "voiznowner",
      role: UserRole.ADMIN,
      accessStatus: AccessStatus.APPROVED,
      isEmailVerified: true,
      loginMethod: LoginMethod.EMAIL,
      passwordHash: await hashValue(adminPassword),
      country: "United Kingdom",
      approvedAt: new Date(),
    },
  });

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
      totalAmount: 178,
      currency: "GBP",
      items: {
        create: [
          {
            productId: "ghostline-hoodie",
            productName: "Ghostline Hoodie",
            variant: "Black / M",
            quantity: 1,
            unitPrice: 78,
          },
          {
            productId: "signal-tee",
            productName: "Signal Tee",
            variant: "White / L",
            quantity: 1,
            unitPrice: 34,
          },
          {
            productId: "silent-short",
            productName: "Silent Short",
            variant: "Black / M",
            quantity: 1,
            unitPrice: 66,
          },
        ],
      },
    },
  });
}
