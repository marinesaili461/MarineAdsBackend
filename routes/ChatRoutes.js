import { Router } from "express";
import { protect } from "../Middlewares/authMiddleware.js";
import restrictTo from "../Middlewares/roleMiddleware.js";
import {
  getMessages,
  sendMessage,
  sendImageMessage,
  addReaction,
  deleteMessage,
  clearMessages,
  toggleChatRoom,
  banUser,
  unbanUser,
  getRoomInfo,
  chatUpload,
} from "../Controllers/ChatController.js";

const router = Router();

// ── User routes ───────────────────────────────────────────────────
router.get("/messages",                    protect, getMessages);
router.post("/message",                    protect, sendMessage);
router.post("/message/image",              protect, chatUpload.single("image"), sendImageMessage);
router.post("/message/:messageId/react",   protect, addReaction);
router.delete("/message/:messageId",       protect, deleteMessage);

// ── Admin routes ──────────────────────────────────────────────────
router.get("/admin/room-info",             protect, restrictTo("admin", "superadmin"), getRoomInfo);
router.post("/admin/clear-messages",       protect, restrictTo("admin", "superadmin"), clearMessages);
router.post("/admin/toggle-room",          protect, restrictTo("admin", "superadmin"), toggleChatRoom);
router.post("/admin/ban-user",             protect, restrictTo("admin", "superadmin"), banUser);
router.post("/admin/unban-user",           protect, restrictTo("admin", "superadmin"), unbanUser);

export default router;
