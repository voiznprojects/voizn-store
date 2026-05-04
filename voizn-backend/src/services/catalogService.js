import { AccessStatus, AlertStatus, AnalyticsEventType, ProductVisibility } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendBackInStockEmail, sendDropNotificationEmail } from "../utils/email.js";
import { DROP_SEED, PRODUCT_SEED } from "../data/catalogSeed.js";

const LOW_STOCK_THRESHOLD = 3;

function buildVariantTitle(variant) {
  return [variant.color, variant.size].filter(Boolean).join(" / ") || variant.title;
}

function computeDropState(drop) {
  const releaseTime = new Date(drop.releaseDate).getTime();
  const now = Date.now();
  const isReleased = now >= releaseTime;
  return {
    ...drop,
    isReleased,
    countdownMs: Math.max(0, releaseTime - now),
    effectiveLocked: drop.isLocked && !isReleased,
  };
}

function normalizeVariant(variant) {
  return {
    id: variant.id,
    shopifyVariantId: variant.shopifyVariantId,
    shopifyVariantGid: variant.shopifyVariantGid,
    title: variant.title,
    color: variant.color,
    size: variant.size,
    price: Number(variant.price),
    compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
    stock: variant.stock,
    available: variant.stock > 0 && variant.isActive,
    lowStock: variant.stock > 0 && variant.stock <= LOW_STOCK_THRESHOLD,
    urgencyText:
      variant.stock === 0
        ? "Out of stock"
        : variant.stock <= LOW_STOCK_THRESHOLD
          ? variant.stock === 1
            ? "Only 1 left"
            : `Only ${variant.stock} left`
          : null,
  };
}

function normalizeProduct(product, viewer) {
  const variants = product.variants.map(normalizeVariant);
  const inStockVariants = variants.filter((variant) => variant.available);
  const stock = variants.reduce((sum, variant) => sum + variant.stock, 0);
  const activeDrop = product.dropLinks
    .map((entry) => computeDropState(entry.drop))
    .sort((first, second) => new Date(first.releaseDate) - new Date(second.releaseDate))[0] || null;
  const privateAccessOnly =
    product.visibility === ProductVisibility.PRIVATE_ACCESS ||
    activeDrop?.isPrivateAccessOnly ||
    false;
  const viewerApproved = viewer?.accessStatus === AccessStatus.APPROVED;
  const isVisible = !privateAccessOnly || viewerApproved;
  const isPurchasable = isVisible && !(activeDrop?.effectiveLocked) && inStockVariants.length > 0;

  return {
    id: product.id,
    slug: product.slug,
    shopifyProductId: product.shopifyProductId,
    name: product.name,
    category: product.category,
    description: product.description,
    shortDescription: product.shortDescription,
    price: Number(product.price),
    currency: product.currency,
    artClass: product.artClass,
    imageUrl: product.imageUrl,
    materialInfo: product.materialInfo,
    details: Array.isArray(product.details) ? product.details : [],
    stock,
    available: inStockVariants.length > 0,
    lowStock: stock > 0 && stock <= LOW_STOCK_THRESHOLD,
    urgencyText:
      stock === 0 ? "Out of stock" : stock <= LOW_STOCK_THRESHOLD ? `Only ${stock} left` : null,
    privateAccessOnly,
    locked: activeDrop?.effectiveLocked || product.isLocked,
    releaseDate: activeDrop?.releaseDate || product.releaseDate,
    drop: activeDrop
      ? {
          slug: activeDrop.slug,
          title: activeDrop.title,
          description: activeDrop.description,
          releaseDate: activeDrop.releaseDate,
          countdownMs: activeDrop.countdownMs,
          isReleased: activeDrop.isReleased,
          isPrivateAccessOnly: activeDrop.isPrivateAccessOnly,
          isLocked: activeDrop.effectiveLocked,
        }
      : null,
    visible: isVisible,
    purchasable: isPurchasable,
    variants,
    options: {
      colors: [...new Set(variants.map((variant) => variant.color).filter(Boolean))],
      sizes: [...new Set(variants.map((variant) => variant.size).filter(Boolean))],
    },
  };
}

export async function ensureCatalogSeedData() {
  for (const productSeed of PRODUCT_SEED) {
    const product = await prisma.product.upsert({
      where: { slug: productSeed.slug },
      update: {
        name: productSeed.name,
        shopifyProductId: productSeed.shopifyProductId || null,
        category: productSeed.category,
        description: productSeed.description,
        shortDescription: productSeed.shortDescription,
        price: productSeed.price,
        currency: "GBP",
        artClass: productSeed.artClass,
        materialInfo: productSeed.materialInfo,
        details: productSeed.details,
        visibility:
          productSeed.visibility === "PRIVATE_ACCESS"
            ? ProductVisibility.PRIVATE_ACCESS
            : ProductVisibility.PUBLIC,
      },
      create: {
        slug: productSeed.slug,
        name: productSeed.name,
        shopifyProductId: productSeed.shopifyProductId || null,
        category: productSeed.category,
        description: productSeed.description,
        shortDescription: productSeed.shortDescription,
        price: productSeed.price,
        currency: "GBP",
        artClass: productSeed.artClass,
        materialInfo: productSeed.materialInfo,
        details: productSeed.details,
        visibility:
          productSeed.visibility === "PRIVATE_ACCESS"
            ? ProductVisibility.PRIVATE_ACCESS
            : ProductVisibility.PUBLIC,
      },
    });

    for (const variantSeed of productSeed.variants) {
      await prisma.productVariant.upsert({
        where: {
          sku: `${productSeed.slug}-${(variantSeed.color || "default").toLowerCase()}-${(variantSeed.size || "os").toLowerCase()}`,
        },
        update: {
          shopifyVariantId: variantSeed.shopifyVariantId || null,
          shopifyVariantGid: variantSeed.shopifyVariantGid || null,
          title: variantSeed.title,
          color: variantSeed.color || null,
          size: variantSeed.size || null,
          price: variantSeed.price,
          stock: variantSeed.stock,
          productId: product.id,
        },
        create: {
          sku: `${productSeed.slug}-${(variantSeed.color || "default").toLowerCase()}-${(variantSeed.size || "os").toLowerCase()}`,
          shopifyVariantId: variantSeed.shopifyVariantId || null,
          shopifyVariantGid: variantSeed.shopifyVariantGid || null,
          title: variantSeed.title,
          color: variantSeed.color || null,
          size: variantSeed.size || null,
          price: variantSeed.price,
          stock: variantSeed.stock,
          productId: product.id,
        },
      });
    }
  }

  for (const dropSeed of DROP_SEED) {
    const drop = await prisma.drop.upsert({
      where: { slug: dropSeed.slug },
      update: {
        title: dropSeed.title,
        description: dropSeed.description,
        releaseDate: new Date(dropSeed.releaseDate),
        isLocked: dropSeed.isLocked,
        isPrivateAccessOnly: dropSeed.isPrivateAccessOnly,
      },
      create: {
        slug: dropSeed.slug,
        title: dropSeed.title,
        description: dropSeed.description,
        releaseDate: new Date(dropSeed.releaseDate),
        isLocked: dropSeed.isLocked,
        isPrivateAccessOnly: dropSeed.isPrivateAccessOnly,
      },
    });

    for (const productSlug of dropSeed.products) {
      const product = await prisma.product.findUnique({ where: { slug: productSlug } });
      if (!product) continue;
      await prisma.dropProduct.upsert({
        where: {
          dropId_productId: {
            dropId: drop.id,
            productId: product.id,
          },
        },
        update: {},
        create: {
          dropId: drop.id,
          productId: product.id,
        },
      });
    }
  }
}

export async function listCatalogProducts(viewer) {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      variants: { where: { isActive: true }, orderBy: [{ color: "asc" }, { size: "asc" }] },
      dropLinks: { include: { drop: true } },
    },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });

  return products
    .map((product) => normalizeProduct(product, viewer))
    .filter((product) => product.visible);
}

export async function getCatalogProduct(slug, viewer) {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      variants: { where: { isActive: true }, orderBy: [{ color: "asc" }, { size: "asc" }] },
      dropLinks: { include: { drop: true } },
    },
  });

  if (!product) {
    return null;
  }

  const normalized = normalizeProduct(product, viewer);
  if (!normalized.visible) {
    return null;
  }
  return normalized;
}

export async function listDrops(viewer) {
  const drops = await prisma.drop.findMany({
    include: {
      products: {
        include: {
          product: {
            include: {
              variants: true,
              dropLinks: { include: { drop: true } },
            },
          },
        },
      },
    },
    orderBy: { releaseDate: "asc" },
  });

  return drops.map((drop) => {
    const state = computeDropState(drop);
    return {
      id: drop.id,
      slug: drop.slug,
      title: drop.title,
      description: drop.description,
      releaseDate: drop.releaseDate,
      isLocked: state.effectiveLocked,
      isPrivateAccessOnly: drop.isPrivateAccessOnly,
      countdownMs: state.countdownMs,
      isReleased: state.isReleased,
      products: drop.products
        .map((entry) => normalizeProduct(entry.product, viewer))
        .filter((product) => product.visible),
    };
  });
}

export async function createBackInStockAlert({ user, email, productSlug, variantId }) {
  const product = await prisma.product.findUnique({
    where: { slug: productSlug },
    include: { variants: true },
  });

  if (!product) {
    throw Object.assign(new Error("Product not found."), {
      statusCode: 404,
      code: "product_not_found",
    });
  }

  const variant = variantId
    ? product.variants.find((entry) => entry.id === variantId)
    : null;

  const alert = await prisma.backInStockAlert.upsert({
    where: {
      email_productId_variantId: {
        email,
        productId: product.id,
        variantId: variant?.id || null,
      },
    },
    update: {
      userId: user?.id || null,
      status: AlertStatus.ACTIVE,
      notifiedAt: null,
    },
    create: {
      userId: user?.id || null,
      email,
      productId: product.id,
      variantId: variant?.id || null,
      status: AlertStatus.ACTIVE,
    },
  });

  return { alert, product, variant };
}

export async function createDropSignup({ user, email, dropSlug }) {
  const drop = await prisma.drop.findUnique({ where: { slug: dropSlug } });
  if (!drop) {
    throw Object.assign(new Error("Drop not found."), {
      statusCode: 404,
      code: "drop_not_found",
    });
  }

  return prisma.dropNotificationSignup.upsert({
    where: {
      dropId_email: {
        dropId: drop.id,
        email,
      },
    },
    update: {
      userId: user?.id || null,
    },
    create: {
      dropId: drop.id,
      userId: user?.id || null,
      email,
    },
  });
}

export async function updateVariantStock({ variantId, stock }) {
  const before = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });

  if (!before) {
    throw Object.assign(new Error("Variant not found."), {
      statusCode: 404,
      code: "variant_not_found",
    });
  }

  const variant = await prisma.productVariant.update({
    where: { id: variantId },
    data: { stock },
    include: { product: true },
  });

  if (before.stock <= 0 && stock > 0) {
    const alerts = await prisma.backInStockAlert.findMany({
      where: {
        productId: variant.productId,
        variantId: variant.id,
        status: AlertStatus.ACTIVE,
      },
    });

    for (const alert of alerts) {
      await sendBackInStockEmail(alert.email, variant.product.name, buildVariantTitle(variant));
      await prisma.backInStockAlert.update({
        where: { id: alert.id },
        data: {
          status: AlertStatus.NOTIFIED,
          notifiedAt: new Date(),
        },
      });
    }
  }

  return variant;
}

export async function updateDrop(dropId, data) {
  const drop = await prisma.drop.update({
    where: { id: dropId },
    data: {
      title: data.title,
      description: data.description,
      releaseDate: data.releaseDate ? new Date(data.releaseDate) : undefined,
      isLocked: typeof data.isLocked === "boolean" ? data.isLocked : undefined,
      isPrivateAccessOnly:
        typeof data.isPrivateAccessOnly === "boolean"
          ? data.isPrivateAccessOnly
          : undefined,
    },
  });

  const state = computeDropState(drop);
  if (state.isReleased) {
    const signups = await prisma.dropNotificationSignup.findMany({
      where: { dropId: drop.id, notifiedAt: null },
    });

    for (const signup of signups) {
      await sendDropNotificationEmail(signup.email, drop);
      await prisma.dropNotificationSignup.update({
        where: { id: signup.id },
        data: { notifiedAt: new Date() },
      });
    }
  }

  return drop;
}

export async function recordAnalyticsEvent({ eventType, userId, sessionId, productSlug, path, metadata }) {
  const product = productSlug
    ? await prisma.product.findUnique({ where: { slug: productSlug } })
    : null;

  return prisma.analyticsEvent.create({
    data: {
      eventType: AnalyticsEventType[eventType] || AnalyticsEventType.PAGE_VIEW,
      userId: userId || null,
      sessionId: sessionId || null,
      productId: product?.id || null,
      path,
      metadata: metadata || undefined,
    },
  });
}

export async function getAnalyticsSummary({ from, to }) {
  const where = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const [totalPageViews, addToBasketCount, favoriteCount, conversionCount, recentEvents, topProductRows] =
    await Promise.all([
      prisma.analyticsEvent.count({ where: { ...where, eventType: "PAGE_VIEW" } }),
      prisma.analyticsEvent.count({ where: { ...where, eventType: "ADD_TO_BASKET" } }),
      prisma.analyticsEvent.count({ where: { ...where, eventType: "FAVORITE" } }),
      prisma.analyticsEvent.count({ where: { ...where, eventType: "CHECKOUT" } }),
      prisma.analyticsEvent.findMany({
        where,
        include: { product: true, user: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.analyticsEvent.groupBy({
        by: ["productId"],
        where: {
          ...where,
          eventType: "PRODUCT_CLICK",
          productId: { not: null },
        },
        _count: { productId: true },
        orderBy: { _count: { productId: "desc" } },
        take: 6,
      }),
    ]);

  const productIds = topProductRows.map((row) => row.productId).filter(Boolean);
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } } })
    : [];

  return {
    totalPageViews,
    addToBasketCount,
    favoriteCount,
    conversionCount,
    topProducts: topProductRows.map((row) => ({
      productId: row.productId,
      count: row._count.productId,
      product: products.find((product) => product.id === row.productId) || null,
    })),
    recentEvents: recentEvents.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      path: event.path,
      createdAt: event.createdAt,
      sessionId: event.sessionId,
      metadata: event.metadata,
      user: event.user
        ? {
            id: event.user.id,
            name: event.user.name,
            email: event.user.email,
          }
        : null,
      product: event.product
        ? {
            id: event.product.id,
            slug: event.product.slug,
            name: event.product.name,
          }
        : null,
    })),
  };
}
