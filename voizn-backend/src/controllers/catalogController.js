import {
  createBackInStockAlert,
  createDropSignup,
  getCatalogProduct,
  listCatalogProducts,
  listDrops,
} from "../services/catalogService.js";
import { asyncHandler, jsonError } from "../utils/http.js";

export const getProducts = asyncHandler(async (request, response) => {
  const products = await listCatalogProducts(request.user);
  response.json({ ok: true, products });
});

export const getProduct = asyncHandler(async (request, response) => {
  const product = await getCatalogProduct(request.params.slug, request.user);
  if (!product) {
    jsonError(response, 404, "Product not found.", "not_found");
    return;
  }
  response.json({ ok: true, product });
});

export const getDrops = asyncHandler(async (request, response) => {
  const drops = await listDrops(request.user);
  response.json({ ok: true, drops });
});

export const signupBackInStock = asyncHandler(async (request, response) => {
  const { email, productSlug, variantId } = request.body || {};
  if (!email || !productSlug) {
    jsonError(response, 400, "Email and product are required.", "validation_error");
    return;
  }

  await createBackInStockAlert({
    user: request.user || null,
    email: String(email).trim().toLowerCase(),
    productSlug,
    variantId: variantId || null,
  });

  response.status(201).json({
    ok: true,
    message: "We will email you when this piece is available again.",
  });
});

export const signupDropNotification = asyncHandler(async (request, response) => {
  const { email, dropSlug } = request.body || {};
  if (!email || !dropSlug) {
    jsonError(response, 400, "Email and drop are required.", "validation_error");
    return;
  }

  await createDropSignup({
    user: request.user || null,
    email: String(email).trim().toLowerCase(),
    dropSlug,
  });

  response.status(201).json({
    ok: true,
    message: "You are signed up for this VOIZN drop notification.",
  });
});
