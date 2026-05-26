import { AccessStatus, AnalyticsEventType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

const HIGH_INTENT_PRIORITY = {
  ORDER_PLACED: 100,
  CHECKOUT: 92,
  ADD_TO_BASKET: 86,
  SIGNUP: 80,
  APPROVAL_REQUEST: 78,
  BACK_IN_STOCK_SIGNUP: 74,
  DROP_NOTIFICATION_SIGNUP: 72,
  FAVORITE: 66,
  PRODUCT_CLICK: 34,
  PAGE_VIEW: 12,
};

const PRODUCT_EVENT_TYPES = new Set([
  "PAGE_VIEW",
  "PRODUCT_CLICK",
  "ADD_TO_BASKET",
  "FAVORITE",
  "CHECKOUT",
  "ORDER_PLACED",
]);

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function parseRange({ range = "7d", from = null, to = null } = {}) {
  if (from || to) {
    return {
      from: from ? startOfDay(from) : null,
      to: to ? endOfDay(to) : null,
      label: "Custom range",
    };
  }

  const now = new Date();
  if (range === "today") {
    return { from: startOfDay(now), to: endOfDay(now), label: "Today" };
  }
  if (range === "30d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { from: startOfDay(start), to: endOfDay(now), label: "Last 30 days" };
  }

  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  return { from: startOfDay(start), to: endOfDay(now), label: "Last 7 days" };
}

function buildCreatedAtWhere(bounds) {
  const createdAt = {};
  if (bounds.from) createdAt.gte = bounds.from;
  if (bounds.to) createdAt.lte = bounds.to;
  return Object.keys(createdAt).length ? { createdAt } : {};
}

function normalizeString(value) {
  return String(value || "").trim().toLowerCase();
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getEventDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function parseBrowser(userAgent = "") {
  const agent = String(userAgent || "").toLowerCase();
  if (!agent) return null;
  if (agent.includes("edg/")) return "Edge";
  if (agent.includes("chrome/") && !agent.includes("edg/")) return "Chrome";
  if (agent.includes("safari/") && !agent.includes("chrome/")) return "Safari";
  if (agent.includes("firefox/")) return "Firefox";
  if (agent.includes("opr/") || agent.includes("opera")) return "Opera";
  return "Browser";
}

function parseDevice(userAgent = "", platform = "") {
  const source = `${String(userAgent || "")} ${String(platform || "")}`.toLowerCase();
  if (!source) return null;
  if (source.includes("iphone") || source.includes("android") || source.includes("mobile")) {
    return "Mobile";
  }
  if (source.includes("ipad") || source.includes("tablet")) {
    return "Tablet";
  }
  return "Desktop";
}

function extractMeta(metadata, key) {
  return metadata && typeof metadata === "object" ? metadata[key] ?? null : null;
}

function eventLabel(eventType, metadata) {
  if (eventType === "FAVORITE") {
    return extractMeta(metadata, "action") === "remove"
      ? "Favourite Removed"
      : "Favourite Added";
  }
  if (eventType === "CHECKOUT") return "Checkout Started";
  if (eventType === "ADD_TO_BASKET") return "Added To Basket";
  if (eventType === "PRODUCT_CLICK") return "Product Clicked";
  if (eventType === "PAGE_VIEW") return "Page Viewed";
  if (eventType === "SIGNUP") return "Signup Started";
  if (eventType === "APPROVAL_REQUEST") return "Approval Requested";
  if (eventType === "ORDER_PLACED") return "Order Placed";
  if (eventType === "BACK_IN_STOCK_SIGNUP") return "Back In Stock Signup";
  if (eventType === "DROP_NOTIFICATION_SIGNUP") return "Drop Notify Signup";
  return toTitleCase(eventType);
}

function buildActivityRecord(base) {
  const metadata = base.metadata || {};
  const browser = extractMeta(metadata, "browser") || parseBrowser(extractMeta(metadata, "userAgent"));
  const device = extractMeta(metadata, "device") || parseDevice(extractMeta(metadata, "userAgent"), extractMeta(metadata, "platform"));
  const country = extractMeta(metadata, "country");
  const orderNumber = extractMeta(metadata, "orderNumber");
  const eventType = base.eventType;
  const productName = base.product?.name || extractMeta(metadata, "productName") || null;
  const path = base.path || extractMeta(metadata, "path") || null;
  const userEmail = base.user?.email || base.email || null;
  const actorLabel = userEmail || "Guest";
  const title =
    eventType === "PAGE_VIEW"
      ? path || "Page view"
      : orderNumber
        ? `Order #${orderNumber}`
        : productName || path || eventLabel(eventType, metadata);

  return {
    id: base.id,
    source: base.source || "analytics",
    eventType,
    label: eventLabel(eventType, metadata),
    title,
    path,
    product: base.product || null,
    orderNumber: orderNumber || base.orderNumber || null,
    user: base.user || null,
    userEmail,
    actorLabel,
    sessionId: base.sessionId || null,
    metadata,
    createdAt: base.createdAt,
    latestAt: base.createdAt,
    count: 1,
    browser,
    device,
    country,
    priority: HIGH_INTENT_PRIORITY[eventType] || 20,
    actions: {
      productHref: base.product?.slug ? `/${base.product.slug}/` : null,
      orderHref: orderNumber ? `/orders/?order=${orderNumber}` : null,
      userEmail: userEmail || null,
    },
  };
}

function buildGroupedActivity(records, includePageViews) {
  const grouped = new Map();

  records.forEach((record) => {
    if (!includePageViews && record.eventType === "PAGE_VIEW") {
      return;
    }

    const actorKey =
      record.eventType === "PAGE_VIEW"
        ? "aggregate"
        : record.user?.id || record.sessionId || "guest";
    const targetKey =
      record.orderNumber ||
      record.product?.id ||
      record.path ||
      record.title ||
      "general";
    const day = getEventDay(record.createdAt);
    const key = `${day}:${record.eventType}:${actorKey}:${targetKey}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...record,
        groupDay: day,
      });
      return;
    }

    existing.count += 1;
    if (new Date(record.createdAt) > new Date(existing.latestAt)) {
      existing.latestAt = record.createdAt;
    }
  });

  return Array.from(grouped.values())
    .map((event) => ({
      ...event,
      summaryText:
        event.count > 1
          ? `${event.title} ${event.count} times today`
          : event.title,
    }))
    .sort((first, second) => {
      if (second.priority !== first.priority) {
        return second.priority - first.priority;
      }
      return new Date(second.latestAt) - new Date(first.latestAt);
    });
}

function applySearch(records, search) {
  const query = normalizeString(search);
  if (!query) return records;
  return records.filter((record) => {
    const haystack = [
      record.label,
      record.title,
      record.path,
      record.userEmail,
      record.actorLabel,
      record.product?.name,
      record.orderNumber ? String(record.orderNumber) : "",
      record.device,
      record.browser,
      record.country,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function applyEventType(records, eventType) {
  if (!eventType || eventType === "all") return records;
  return records.filter((record) => record.eventType === eventType);
}

async function loadAnalyticsEvents(bounds) {
  return prisma.analyticsEvent.findMany({
    where: buildCreatedAtWhere(bounds),
    include: {
      product: true,
      user: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 800,
  });
}

async function loadSyntheticRecords(bounds) {
  const where = buildCreatedAtWhere(bounds);

  const [signups, approvalRequests, orders, backInStockSignups, dropSignups] =
    await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, email: true, name: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.user.findMany({
        where: {
          ...where,
          accessStatus: AccessStatus.PENDING_APPROVAL,
          isEmailVerified: true,
        },
        select: { id: true, email: true, name: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      prisma.order.findMany({
        where,
        include: {
          user: true,
          items: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.backInStockAlert.findMany({
        where,
        include: {
          user: true,
          product: true,
          variant: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.dropNotificationSignup.findMany({
        where,
        include: {
          user: true,
          drop: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

  return [
    ...signups.map((user) =>
      buildActivityRecord({
        id: `signup-${user.id}`,
        source: "user",
        eventType: "SIGNUP",
        createdAt: user.createdAt,
        user,
        path: "/signup",
        metadata: {},
      }),
    ),
    ...approvalRequests.map((user) =>
      buildActivityRecord({
        id: `approval-request-${user.id}`,
        source: "user",
        eventType: "APPROVAL_REQUEST",
        createdAt: user.updatedAt,
        user,
        path: "/access-status",
        metadata: {},
      }),
    ),
    ...orders.map((order) =>
      buildActivityRecord({
        id: `order-${order.id}`,
        source: "order",
        eventType: "ORDER_PLACED",
        createdAt: order.createdAt,
        user: order.user,
        product: order.items[0]
          ? {
              id: order.items[0].productId,
              slug: null,
              name: order.items[0].productName,
            }
          : null,
        orderNumber: order.orderNumber,
        metadata: {
          orderNumber: order.orderNumber,
          productName: order.items[0]?.productName || null,
        },
      }),
    ),
    ...backInStockSignups.map((alert) =>
      buildActivityRecord({
        id: `back-in-stock-${alert.id}`,
        source: "back-in-stock",
        eventType: "BACK_IN_STOCK_SIGNUP",
        createdAt: alert.createdAt,
        user: alert.user,
        email: alert.email,
        product: alert.product,
        metadata: {
          productName: alert.product?.name,
          variant: alert.variant?.title || null,
        },
      }),
    ),
    ...dropSignups.map((signup) =>
      buildActivityRecord({
        id: `drop-signup-${signup.id}`,
        source: "drop",
        eventType: "DROP_NOTIFICATION_SIGNUP",
        createdAt: signup.createdAt,
        user: signup.user,
        email: signup.email,
        path: signup.drop?.slug ? `/drops/${signup.drop.slug}` : null,
        metadata: {
          productName: signup.drop?.title || null,
        },
      }),
    ),
  ];
}

async function loadAllActivityRecords(bounds) {
  const analyticsEvents = await loadAnalyticsEvents(bounds);
  const records = analyticsEvents.map((event) =>
    buildActivityRecord({
      id: event.id,
      source: "analytics",
      eventType: event.eventType,
      createdAt: event.createdAt,
      user: event.user,
      sessionId: event.sessionId,
      product: event.product,
      path: event.path,
      metadata: event.metadata || {},
    }),
  );

  const synthetic = await loadSyntheticRecords(bounds);
  return [...records, ...synthetic];
}

function summarizeTopProduct(productRows, metric) {
  const winner = [...productRows]
    .filter((row) => row[metric] > 0)
    .sort((first, second) => second[metric] - first[metric])[0];
  return winner
    ? { name: winner.name, slug: winner.slug, count: winner[metric] }
    : null;
}

export async function getAdminAnalyticsProducts(query = {}) {
  const bounds = parseRange(query);
  const records = await loadAllActivityRecords(bounds);
  const filtered = applySearch(applyEventType(records, query.eventType), query.search).filter(
    (record) => PRODUCT_EVENT_TYPES.has(record.eventType) && record.product?.name,
  );

  const productMap = new Map();

  filtered.forEach((record) => {
    const key = record.product?.id || record.product?.name;
    if (!key) return;

    if (!productMap.has(key)) {
      productMap.set(key, {
        productId: record.product?.id || null,
        slug: record.product?.slug || null,
        name: record.product?.name || "Unknown product",
        views: 0,
        clicks: 0,
        addToBasket: 0,
        favorites: 0,
        checkoutStarts: 0,
        orders: 0,
      });
    }

    const row = productMap.get(key);
    if (record.eventType === "PAGE_VIEW") row.views += record.count;
    if (record.eventType === "PRODUCT_CLICK") row.clicks += record.count;
    if (record.eventType === "ADD_TO_BASKET") row.addToBasket += record.count;
    if (record.eventType === "FAVORITE" && extractMeta(record.metadata, "action") !== "remove") {
      row.favorites += record.count;
    }
    if (record.eventType === "CHECKOUT") row.checkoutStarts += record.count;
    if (record.eventType === "ORDER_PLACED") row.orders += record.count;
  });

  const rows = Array.from(productMap.values())
    .map((row) => ({
      ...row,
      conversionRate:
        row.views > 0
          ? Math.round((row.orders / row.views) * 100)
          : row.clicks > 0
            ? Math.round((row.orders / row.clicks) * 100)
            : 0,
    }))
    .sort((first, second) => {
      if (second.orders !== first.orders) return second.orders - first.orders;
      if (second.addToBasket !== first.addToBasket) return second.addToBasket - first.addToBasket;
      return second.clicks - first.clicks;
    });

  return {
    range: bounds.label,
    products: rows,
  };
}

export async function getAdminAnalyticsSummary(query = {}) {
  const bounds = parseRange(query);
  const todayBounds = parseRange({ range: "today" });
  const [records, todayPageViews, usersCreated, pendingApprovalUsers, ordersPlaced, backInStockSignups, dropNotificationSignups, productAnalytics] =
    await Promise.all([
      loadAllActivityRecords(bounds),
      prisma.analyticsEvent.count({
        where: {
          ...buildCreatedAtWhere(todayBounds),
          eventType: AnalyticsEventType.PAGE_VIEW,
        },
      }),
      prisma.user.count({ where: buildCreatedAtWhere(bounds) }),
      prisma.user.count({
        where: {
          ...buildCreatedAtWhere(bounds),
          accessStatus: AccessStatus.PENDING_APPROVAL,
          isEmailVerified: true,
        },
      }),
      prisma.order.count({ where: buildCreatedAtWhere(bounds) }),
      prisma.backInStockAlert.count({ where: buildCreatedAtWhere(bounds) }),
      prisma.dropNotificationSignup.count({ where: buildCreatedAtWhere(bounds) }),
      getAdminAnalyticsProducts({ ...query, eventType: "all", search: "" }),
    ]);

  const countByType = (eventType, predicate = null) =>
    records.reduce((sum, record) => {
      if (record.eventType !== eventType) return sum;
      if (predicate && !predicate(record)) return sum;
      return sum + record.count;
    }, 0);

  return {
    range: bounds.label,
    totals: {
      todaysPageViews: todayPageViews,
      checkoutStarts: countByType("CHECKOUT"),
      newSignups: usersCreated,
      approvalRequests: pendingApprovalUsers,
      ordersPlaced,
      backInStockSignups,
      dropNotificationSignups,
    },
    productLeaders: {
      topClickedProduct: summarizeTopProduct(productAnalytics.products, "clicks"),
      mostAddedToBasketProduct: summarizeTopProduct(productAnalytics.products, "addToBasket"),
      mostFavoritedProduct: summarizeTopProduct(productAnalytics.products, "favorites"),
    },
  };
}

export async function getAdminAnalyticsActivity(query = {}) {
  const bounds = parseRange(query);
  const records = await loadAllActivityRecords(bounds);
  const filtered = applySearch(
    applyEventType(records, query.eventType),
    query.search,
  );

  const includePageViews = query.eventType === "PAGE_VIEW";
  const grouped = buildGroupedActivity(filtered, includePageViews);
  const page = Math.max(Number.parseInt(query.page || "1", 10), 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit || "20", 10), 1), 100);
  const start = (page - 1) * limit;

  return {
    range: bounds.label,
    total: grouped.length,
    page,
    limit,
    items: grouped.slice(start, start + limit),
  };
}
