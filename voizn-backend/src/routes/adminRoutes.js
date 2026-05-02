import { Router } from "express";
import {
  approvePendingUser,
  rejectPendingUser,
} from "../controllers/authController.js";
import { listPendingAccessUsers } from "../controllers/adminController.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, requireAdmin);
router.get("/pending-access", listPendingAccessUsers);
router.post("/approve-user", approvePendingUser);
router.post("/reject-user", rejectPendingUser);
router.post("/users/:id/approve", approvePendingUser);
router.post("/users/:id/reject", rejectPendingUser);

export default router;
