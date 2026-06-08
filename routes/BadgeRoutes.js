import { Router } from "express";
import { protect } from "../Middlewares/authMiddleware.js";
import restrictTo from "../Middlewares/roleMiddleware.js";
import {
  createBadge,
  getBadges,
  editBadge,
  toggleBadgeVisibility,
  deleteBadge,
  assignBadge,
  bulkReassign,
  getUsersForBadge,
  badgeUpload,
} from "../Controllers/BadgeController.js";

const router = Router();

router.get("/",                    protect, getBadges);
router.post("/",                   protect, restrictTo("admin", "superadmin"), badgeUpload.single("image"), createBadge);
router.patch("/:id",               protect, restrictTo("admin", "superadmin"), badgeUpload.single("image"), editBadge);
router.patch("/:id/visibility",    protect, restrictTo("admin", "superadmin"), toggleBadgeVisibility);
router.delete("/:id",              protect, restrictTo("admin", "superadmin"), deleteBadge);
router.post("/assign",             protect, restrictTo("admin", "superadmin"), assignBadge);
router.post("/bulk-reassign",      protect, restrictTo("admin", "superadmin"), bulkReassign);
router.get("/users",               protect, restrictTo("admin", "superadmin"), getUsersForBadge);

export default router;
