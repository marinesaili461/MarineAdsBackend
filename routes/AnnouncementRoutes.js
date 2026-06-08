import { Router } from "express";
import { protect } from "../Middlewares/authMiddleware.js";
import restrictTo from "../Middlewares/roleMiddleware.js";
import {
  getAnnouncements,
  markRead,
  markAllRead,
  getUnreadCount,
  adminGetAll,
  adminCreate,
  adminUpdate,
  adminDelete,
} from "../Controllers/AnnouncementController.js";

const router = Router();

// User
router.get("/",               protect, getAnnouncements);
router.get("/unread-count",   protect, getUnreadCount);
router.post("/mark-all-read", protect, markAllRead);
router.post("/:id/read",      protect, markRead);

// Admin
router.get("/admin/all",  protect, restrictTo("admin", "superadmin"), adminGetAll);
router.post("/",          protect, restrictTo("admin", "superadmin"), adminCreate);
router.put("/:id",        protect, restrictTo("admin", "superadmin"), adminUpdate);
router.delete("/:id",     protect, restrictTo("admin", "superadmin"), adminDelete);

export default router;
