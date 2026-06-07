import { Router } from "express";
import { protect } from "../Middlewares/authMiddleware.js";
import restrictTo from "../Middlewares/roleMiddleware.js";
import {
  getCategories,
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createTicket,
  getUserTickets,
  getTicketById,
  userReply,
  getUserUnreadCount,
  getAllTickets,
  getAdminTicketById,
  adminReply,
  updateTicketStatus,
  deleteTicket,
  getAdminUnreadCount,
} from "../Controllers/SupportController.js";

const router = Router();

// ── Categories ─────────────────────────────────────────────────────
router.get("/categories", protect, getCategories);
router.get("/categories/all", protect, restrictTo("admin", "superadmin"), getAllCategories);
router.post("/categories", protect, restrictTo("admin", "superadmin"), createCategory);
router.put("/categories/:id", protect, restrictTo("admin", "superadmin"), updateCategory);
router.delete("/categories/:id", protect, restrictTo("admin", "superadmin"), deleteCategory);

// ── User Tickets ───────────────────────────────────────────────────
router.get("/my-tickets", protect, getUserTickets);
router.get("/unread-count", protect, getUserUnreadCount);
router.post("/tickets", protect, createTicket);
router.get("/tickets/:id", protect, getTicketById);
router.post("/tickets/:id/reply", protect, userReply);

// ── Admin Tickets ──────────────────────────────────────────────────
router.get("/admin/tickets", protect, restrictTo("admin", "superadmin"), getAllTickets);
router.get("/admin/tickets/unread-count", protect, restrictTo("admin", "superadmin"), getAdminUnreadCount);
router.get("/admin/tickets/:id", protect, restrictTo("admin", "superadmin"), getAdminTicketById);
router.post("/admin/tickets/:id/reply", protect, restrictTo("admin", "superadmin"), adminReply);
router.put("/admin/tickets/:id/status", protect, restrictTo("admin", "superadmin"), updateTicketStatus);
router.delete("/admin/tickets/:id", protect, restrictTo("admin", "superadmin"), deleteTicket);

export default router;
