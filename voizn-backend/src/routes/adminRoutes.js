import { Router } from "express";
import {
  approvePendingUser,
  rejectPendingUser,
} from "../controllers/authController.js";
import {
  getAdminAnalytics,
  getAdminAnalyticsActivity,
  getAdminAnalyticsProducts,
  getAdminAnalyticsSummary,
  listPendingAccessUsers,
  patchDrop,
  patchOrderStatus,
  patchVariantStock,
} from "../controllers/adminController.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, requireAdmin);
router.get("/pending-access", listPendingAccessUsers);
router.get("/analytics", getAdminAnalytics);
router.get("/analytics/summary", getAdminAnalyticsSummary);
router.get("/analytics/activity", getAdminAnalyticsActivity);
router.get("/analytics/products", getAdminAnalyticsProducts);
router.post("/approve-user", approvePendingUser);
router.post("/reject-user", rejectPendingUser);
router.post("/users/:id/approve", approvePendingUser);
router.post("/users/:id/reject", rejectPendingUser);
router.patch("/orders/:orderNumber/status", patchOrderStatus);
router.patch("/variants/:variantId/stock", patchVariantStock);
router.patch("/drops/:dropId", patchDrop);

export default router;
