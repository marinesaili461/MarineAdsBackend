import { Router } from "express";
import {
  createRewardCode,
  deactivateRewardCode,
  deleteRewardCode,
  listRewardCodes,
  redeemRewardCode,
} from "../Controllers/RewardCodeController.js";
import { protect } from "../Middlewares/authMiddleware.js";
import restrictTo from "../Middlewares/roleMiddleware.js";

const router = Router();

// Admin routes
router.post("/create", protect, restrictTo("admin", "superadmin"), createRewardCode);
router.get("/list", protect, restrictTo("admin", "superadmin"), listRewardCodes);
router.patch("/deactivate/:codeId", protect, restrictTo("admin", "superadmin"), deactivateRewardCode);
router.delete("/delete/:codeId", protect, restrictTo("admin", "superadmin"), deleteRewardCode);

// User route
router.post("/redeem", protect, redeemRewardCode);

export default router;
