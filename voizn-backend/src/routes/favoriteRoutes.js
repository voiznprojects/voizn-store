import { Router } from "express";
import {
  createFavorite,
  deleteFavorite,
  getFavorites,
} from "../controllers/favoritesController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", getFavorites);
router.post("/", createFavorite);
router.put("/", createFavorite);
router.delete("/:productId", deleteFavorite);

export default router;
