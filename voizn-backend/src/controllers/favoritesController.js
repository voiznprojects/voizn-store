import { addFavorite, listFavorites, removeFavorite } from "../services/favoriteService.js";
import { asyncHandler, jsonError } from "../utils/http.js";

export const getFavorites = asyncHandler(async (request, response) => {
  const favorites = await listFavorites(request.user.id);
  response.json({ ok: true, favorites });
});

export const createFavorite = asyncHandler(async (request, response) => {
  const favorite = request.body || {};
  if (!favorite.productId || !favorite.name) {
    jsonError(response, 400, "Favorite product details are incomplete.", "validation_error");
    return;
  }

  const savedFavorite = await addFavorite(request.user.id, favorite);
  response.json({ ok: true, favorite: savedFavorite });
});

export const deleteFavorite = asyncHandler(async (request, response) => {
  await removeFavorite(request.user.id, request.params.productId);
  response.json({ ok: true });
});
