import { Router } from "express";
import { getProfile } from "../controllers/profileController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, getProfile);

export default router;
