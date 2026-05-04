import { getAnalyticsSummary, recordAnalyticsEvent } from "../services/catalogService.js";
import { asyncHandler, jsonError } from "../utils/http.js";

export const createAnalyticsEvent = asyncHandler(async (request, response) => {
  const { eventType, sessionId, productSlug, path, metadata } = request.body || {};

  if (!eventType || !path) {
    jsonError(response, 400, "Event type and path are required.", "validation_error");
    return;
  }

  await recordAnalyticsEvent({
    eventType,
    userId: request.user?.id || null,
    sessionId: sessionId || null,
    productSlug: productSlug || null,
    path,
    metadata: metadata || null,
  });

  response.status(201).json({ ok: true });
});

export const getAnalytics = asyncHandler(async (request, response) => {
  const summary = await getAnalyticsSummary({
    from: request.query.from || null,
    to: request.query.to || null,
  });

  response.json({ ok: true, analytics: summary });
});
