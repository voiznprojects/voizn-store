import { prisma } from "../lib/prisma.js";

export function listFavorites(userId) {
  return prisma.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function addFavorite(userId, favorite) {
  return prisma.favorite.upsert({
    where: {
      userId_productId: {
        userId,
        productId: String(favorite.productId),
      },
    },
    update: {
      name: favorite.name,
      tag: favorite.tag || null,
      description: favorite.description || null,
      price: favorite.price || null,
      artClass: favorite.artClass || null,
    },
    create: {
      userId,
      productId: String(favorite.productId),
      name: favorite.name,
      tag: favorite.tag || null,
      description: favorite.description || null,
      price: favorite.price || null,
      artClass: favorite.artClass || null,
    },
  });
}

export function removeFavorite(userId, productId) {
  return prisma.favorite.deleteMany({
    where: {
      userId,
      productId: String(productId),
    },
  });
}
