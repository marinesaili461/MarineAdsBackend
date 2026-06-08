import { Router } from "express";
import { protect } from "../Middlewares/authMiddleware.js";
import restrictTo from "../Middlewares/roleMiddleware.js";
import {
  getAllUsers,
  getUserById,
  getUserTransactions,
  setUserBalance,
  deleteUser,
  blockUser,
  changeRole,
  assignBadge,
  updateAdminPermissions,
  getAnalytics,
  getSettings,
  updateSettings,
  updateBadgeTiers,
  addAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  createPoll,
  closePoll,
  deletePoll,
  handleCheckIn,
} from "../Controllers/AdminController.js";
import {
  editWalletBalance,
  processWithdrawal,
} from "../Controllers/WalletController.js";

const router = Router();

// ── User management ──────────────────────────────────────────────
router.get("/users",                    protect, restrictTo("admin", "superadmin"), getAllUsers);
router.get("/users/:id",                protect, restrictTo("admin", "superadmin"), getUserById);
router.get("/users/:id/transactions",   protect, restrictTo("admin", "superadmin"), getUserTransactions);
router.put("/users/:id/balance",        protect, restrictTo("admin", "superadmin"), setUserBalance);
router.delete("/users/:id",             protect, restrictTo("admin", "superadmin"), deleteUser);
router.post("/block-user",              protect, restrictTo("admin", "superadmin"), blockUser);
router.patch("/users/:id/role",         protect, restrictTo("superadmin"),          changeRole);
router.post("/assign-badge",            protect, restrictTo("admin", "superadmin"), assignBadge);
router.put("/admin-permissions",        protect, restrictTo("superadmin"),          updateAdminPermissions);

// ── Analytics & settings ─────────────────────────────────────────
router.get("/analytics",    protect, restrictTo("admin", "superadmin"), getAnalytics);
router.get("/settings",     protect, restrictTo("admin", "superadmin"), getSettings);
router.put("/settings",     protect, restrictTo("admin", "superadmin"), updateSettings);
router.put("/badge-tiers",  protect, restrictTo("admin", "superadmin"), updateBadgeTiers);

// ── Announcements ────────────────────────────────────────────────
router.post("/announcements",       protect, restrictTo("admin", "superadmin"), addAnnouncement);
router.put("/announcements/:id",    protect, restrictTo("admin", "superadmin"), updateAnnouncement);
router.delete("/announcements/:id", protect, restrictTo("admin", "superadmin"), deleteAnnouncement);

// ── Polls ────────────────────────────────────────────────────────
router.post("/polls",           protect, restrictTo("admin", "superadmin"), createPoll);
router.put("/polls/:id/close",  protect, restrictTo("admin", "superadmin"), closePoll);
router.delete("/polls/:id",     protect, restrictTo("admin", "superadmin"), deletePoll);

// ── Wallet management ────────────────────────────────────────────
router.put("/wallet/edit",                protect, restrictTo("admin", "superadmin"), editWalletBalance);
router.put("/wallet/process-withdrawal",  protect, restrictTo("admin", "superadmin"), processWithdrawal);

// ── Daily check-in ───────────────────────────────────────────────
router.post("/daily-checkin", protect, handleCheckIn);

export default router;
