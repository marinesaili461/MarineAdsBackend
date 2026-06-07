import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Message from "../models/Message.js";
import ChatRoom from "../models/ChatRoom.js";
import User from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Multer for chat images ────────────────────────────────────────
const chatUploadDir = path.join(__dirname, "../uploads/chat-images");
if (!fs.existsSync(chatUploadDir)) fs.mkdirSync(chatUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, chatUploadDir),
  filename:    (_, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});

export const chatUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Images only"));
    cb(null, true);
  },
});

// ── Helpers ───────────────────────────────────────────────────────
const URL_REGEX = /(https?:\/\/|www\.)[^\s]+/i;

export async function getGlobalRoom() {
  let room = await ChatRoom.findOne({ name: "Main Room" });
  if (!room) {
    room = new ChatRoom({ name: "Main Room", isGroup: true });
    await room.save();
  }
  return room;
}

function isActiveBan(ban) {
  return ban.expiresAt > new Date();
}

// ── Get messages (load history) ───────────────────────────────────
export const getMessages = async (req, res) => {
  try {
    const room = await getGlobalRoom();
    const messages = await Message.find({ chatRoom: room._id })
      .populate("sender", "fullName badge referralLevel role")
      .populate("reactions.user", "fullName")
      .sort({ createdAt: 1 });
    res.json({ messages, isClosed: room.isClosed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Send text message ─────────────────────────────────────────────
export const sendMessage = async (req, res) => {
  try {
    const { content } = req.body;
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);

    const room = await getGlobalRoom();

    if (room.isClosed && !isAdmin)
      return res.status(403).json({ error: "Chatroom is currently closed." });

    // Ban check
    const activeBan = room.bans.find(
      (b) => b.user.toString() === req.user._id.toString() && isActiveBan(b)
    );
    if (activeBan && !isAdmin) {
      return res.status(403).json({
        error: "You are banned from this chatroom.",
        expiresAt: activeBan.expiresAt,
      });
    }

    // Block links for non-admins
    if (!isAdmin && URL_REGEX.test(content))
      return res.status(400).json({ error: "Sending links is not allowed." });

    const message = await Message.create({
      chatRoom:       room._id,
      sender:         req.user._id,
      content,
      type:           "text",
      isAdminMessage: isAdmin,
    });

    const populated = await Message.findById(message._id)
      .populate("sender", "fullName badge referralLevel role")
      .populate("reactions.user", "fullName");

    // Emit via socket.io
    const io = req.app.get("io");
    if (io) io.to("main_room").emit("receive_message", populated);

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Upload image message ──────────────────────────────────────────
export const sendImageMessage = async (req, res) => {
  try {
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    const room = await getGlobalRoom();

    if (room.isClosed && !isAdmin)
      return res.status(403).json({ error: "Chatroom is currently closed." });

    const activeBan = room.bans.find(
      (b) => b.user.toString() === req.user._id.toString() && isActiveBan(b)
    );
    if (activeBan && !isAdmin)
      return res.status(403).json({ error: "You are banned from this chatroom.", expiresAt: activeBan.expiresAt });

    if (!req.file) return res.status(400).json({ error: "No image uploaded." });

    const imageUrl = `/uploads/chat-images/${req.file.filename}`;

    const message = await Message.create({
      chatRoom:       room._id,
      sender:         req.user._id,
      content:        "📷 Image",
      type:           "image",
      imageUrl,
      isAdminMessage: isAdmin,
    });

    const populated = await Message.findById(message._id)
      .populate("sender", "fullName badge referralLevel role")
      .populate("reactions.user", "fullName");

    const io = req.app.get("io");
    if (io) io.to("main_room").emit("receive_message", populated);

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── React to message ──────────────────────────────────────────────
export const addReaction = async (req, res) => {
  try {
    const { emoji } = req.body;
    const userId = req.user._id;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    // Toggle: same user + same emoji = remove; else add
    const existingIndex = message.reactions.findIndex(
      (r) => r.user.toString() === userId.toString() && r.emoji === emoji
    );
    if (existingIndex >= 0) message.reactions.splice(existingIndex, 1);
    else message.reactions.push({ user: userId, emoji });

    await message.save();

    const populated = await Message.findById(message._id)
      .populate("sender", "fullName badge referralLevel role")
      .populate("reactions.user", "fullName");

    const io = req.app.get("io");
    if (io) io.to("main_room").emit("message_reaction_updated", populated);

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Admin: Delete single message ──────────────────────────────────
export const deleteMessage = async (req, res) => {
  try {
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    if (!isAdmin && message.sender.toString() !== req.user._id.toString())
      return res.status(403).json({ error: "Not authorized" });

    await message.deleteOne();

    const io = req.app.get("io");
    if (io) io.to("main_room").emit("message_deleted", { messageId: req.params.messageId });

    res.json({ message: "Message deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Admin: Clear messages by age ──────────────────────────────────
export const clearMessages = async (req, res) => {
  try {
    const { days } = req.body; // 0 = all
    const room = await getGlobalRoom();

    let query = { chatRoom: room._id };
    if (days && Number(days) > 0) {
      const cutoff = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
      query.createdAt = { $lt: cutoff };
    }

    const result = await Message.deleteMany(query);

    const io = req.app.get("io");
    if (io) io.to("main_room").emit("messages_cleared", { days: days || 0 });

    res.json({ message: `Deleted ${result.deletedCount} message(s).`, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Admin: Open / close chatroom ──────────────────────────────────
export const toggleChatRoom = async (req, res) => {
  try {
    const { close } = req.body; // true = close, false = open
    const room = await getGlobalRoom();
    room.isClosed = close;
    room.closedAt = close ? new Date() : null;
    room.closedBy = close ? req.user._id : null;
    await room.save();

    const io = req.app.get("io");
    if (io) io.to("main_room").emit("room_status_changed", { isClosed: room.isClosed });

    res.json({ isClosed: room.isClosed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Admin: Ban user from chatroom ─────────────────────────────────
export const banUser = async (req, res) => {
  try {
    const { userId, hours, days, reason } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!hours && !days) return res.status(400).json({ error: "hours or days is required" });

    const totalMs   = ((Number(hours) || 0) + (Number(days) || 0) * 24) * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + totalMs);

    const room = await getGlobalRoom();

    // Remove any existing ban for this user first
    room.bans = room.bans.filter((b) => b.user.toString() !== userId);

    room.bans.push({ user: userId, bannedBy: req.user._id, expiresAt, reason: reason || "" });
    await room.save();

    const io = req.app.get("io");
    if (io) io.to("main_room").emit("user_banned", { userId, expiresAt });

    res.json({ message: "User banned", expiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Admin: Unban user ─────────────────────────────────────────────
export const unbanUser = async (req, res) => {
  try {
    const { userId } = req.body;
    const room = await getGlobalRoom();
    room.bans = room.bans.filter((b) => b.user.toString() !== userId);
    await room.save();
    res.json({ message: "User unbanned" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Admin: Get room status + ban list ─────────────────────────────
export const getRoomInfo = async (req, res) => {
  try {
    const room = await getGlobalRoom();
    const populated = await ChatRoom.findById(room._id)
      .populate("bans.user", "fullName email")
      .populate("bans.bannedBy", "fullName");
    res.json({
      isClosed: populated.isClosed,
      closedAt: populated.closedAt,
      bans: populated.bans.filter(isActiveBan),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
