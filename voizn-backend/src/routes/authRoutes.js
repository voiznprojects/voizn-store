import { Router } from "express";
import {
  appleOauth,
  googleOauth,
  login,
  logout,
  me,
  passwordResetComplete,
  passwordResetStart,
  passwordResetVerifyCode,
  signupSetPassword,
  signupStart,
  signupVerifyCode,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/signup/start", signupStart);
router.post("/signup/verify-code", signupVerifyCode);
router.post("/signup/set-password", signupSetPassword);
router.post("/password-reset/start", passwordResetStart);
router.post("/password-reset/verify-code", passwordResetVerifyCode);
router.post("/password-reset/complete", passwordResetComplete);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);
router.get("/oauth/google", googleOauth);
router.get("/oauth/apple", appleOauth);

export default router;
