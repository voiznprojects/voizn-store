import { Router } from "express";
import { createAnalyticsEvent } from "../controllers/analyticsController.js";

const router = Router();

router.post("/event", createAnalyticsEvent);

export default router;
