import { Router } from "express";
import { protect } from "../Middlewares/authMiddleware.js";
import role from "../Middlewares/roleMiddleware.js";
import * as A from "../Controllers/AdminController.js";
import * as W from "../Controllers/WalletController.js";

const router = Router();
const isAdmin = [protect, role("admin", "superadmin")];
const isSuperAdmin = [protect, role("superadmin")];

router.get("/users", ...isAdmin, A.getAllUsers);
router.put("/block-user", ...isAdmin, A.blockUser);
router.put("/change-role", ...isSuperAdmin, A.changeRole);
router.put("/assign-badge", ...isAdmin, A.assignBadge);
router.put("/admin-permissions", ...isSuperAdmin, A.updateAdminPermissions);
router.get("/analytics", ...isAdmin, A.getAnalytics);
router.get("/settings", ...isAdmin, A.getSettings);
router.put("/settings", ...isAdmin, A.updateSettings);
router.put("/badge-tiers", ...isAdmin, A.updateBadgeTiers);
router.post("/announcements", ...isAdmin, A.addAnnouncement);
router.put("/announcements/:id", ...isAdmin, A.updateAnnouncement);
router.delete("/announcements/:id", ...isAdmin, A.deleteAnnouncement);
router.post("/polls", ...isAdmin, A.createPoll);
router.put("/polls/:id/close", ...isAdmin, A.closePoll);
router.delete("/polls/:id", ...isAdmin, A.deletePoll);
router.put("/wallet/edit", ...isAdmin, W.editWalletBalance);
router.put("/wallet/process-withdrawal", ...isAdmin, W.processWithdrawal);

export default router;
