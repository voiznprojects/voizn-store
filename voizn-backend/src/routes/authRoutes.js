import { Router } from "express";
import {
  login,
  logout,
  me,
  passwordResetComplete,
  passwordResetStart,
  signupSetPassword,
  signupResendCode,
  signupStart,
  signupVerifyCode,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/signup/start", signupStart);
router.post("/signup/resend-code", signupResendCode);
router.post("/signup/verify-code", signupVerifyCode);
router.post("/signup/set-password", signupSetPassword);
router.post("/password-reset/start", passwordResetStart);
router.post("/password-reset/complete", passwordResetComplete);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

export default router;
