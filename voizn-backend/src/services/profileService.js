import { prisma } from "../lib/prisma.js";
import { listFavorites } from "./favoriteService.js";
import { sanitizeUser } from "./userService.js";

export async function getProfileForUser(user) {
  const [favorites, orderCount, orders] = await Promise.all([
    listFavorites(user.id),
    prisma.order.count({ where: { userId: user.id } }),
    prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { orderNumber: "desc" },
      take: 5,
      include: {
        items: true,
      },
    }),
  ]);

  return {
    ...sanitizeUser(user),
    orderCount,
    favorites,
    orders,
  };
}
