import { getProfileForUser } from "../services/profileService.js";
import { asyncHandler } from "../utils/http.js";

export const getProfile = asyncHandler(async (request, response) => {
  const profile = await getProfileForUser(request.user);
  response.json({ ok: true, profile });
});
