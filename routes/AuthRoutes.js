import { Router } from "express";
import * as AuthController from "../Controllers/AuthController.js";
import { protect } from "../Middlewares/authMiddleware.js";

const router = Router();

router.post("/register", AuthController.register);
router.get("/verify", AuthController.verifyEmail);
router.post("/login", AuthController.login);
router.post("/forgot-password", AuthController.forgotPassword);
router.post("/reset-password/:token", AuthController.resetPassword);
router.get("/me", protect, AuthController.getProfile);
router.post("/resend-verification", AuthController.resendVerification);

export default router;
