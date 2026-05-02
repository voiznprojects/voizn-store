import { prisma } from "../lib/prisma.js";
import { listFavorites } from "./favoriteService.js";
import { sanitizeUser } from "./userService.js";

export async function getProfileForUser(user) {
  const [favorites, orderCount] = await Promise.all([
    listFavorites(user.id),
    prisma.order.count({ where: { userId: user.id } }),
  ]);

  return {
    ...sanitizeUser(user),
    orderCount,
    favorites,
  };
}
