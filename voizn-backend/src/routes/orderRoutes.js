import { Router } from "express";
import {
  createOrder,
  getOrder,
  getOrders,
} from "../controllers/ordersController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.post("/", createOrder);
router.get("/", getOrders);
router.get("/:orderNumber", getOrder);

export default router;
