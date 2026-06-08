import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import Message from "../models/Message.js";
import ChatRoom from "../models/ChatRoom.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Cloudinary config ─────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Multer — memory only, no disk ─────────────────────────────────
export const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Images only"));
    cb(null, true);
  },
});

// ── Upload buffer → Cloudinary ────────────────────────────────────
function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "marinecash/chat" },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

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

// ── Reusable populate helper ──────────────────────────────────────
function populateMessage(query) {
  return query
    .populate("sender", "fullName badge referralLevel role")
    .populate("reactions.user", "fullName")
    .populate({
      path: "replyTo",
      select: "content type imageUrl sender",
      populate: { path: "sender", select: "fullName" },
    });
}

// ── Get messages ──────────────────────────────────────────────────
export const getMessages = async (req, res) => {
  try {
    const room = await getGlobalRoom();
    const messages = await populateMessage(
      Message.find({ chatRoom: room._id }).sort({ createdAt: 1 })
    );
    res.json({ messages, isClosed: room.isClosed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Send text message ─────────────────────────────────────────────
export const sendMessage = async (req, res) => {
  try {
    const { content, replyToId } = req.body;
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    const room = await getGlobalRoom();

    if (room.isClosed && !isAdmin)
      return res.status(403).json({ error: "Chatroom is currently closed." });

    const activeBan = room.bans.find(
      (b) => b.user.toString() === req.user._id.toString() && isActiveBan(b)
    );
    if (activeBan && !isAdmin)
      return res.status(403).json({ error: "You are banned from this chatroom.", expiresAt: activeBan.expiresAt });

    if (!isAdmin && URL_REGEX.test(content))
      return res.status(400).json({ error: "Sending links is not allowed." });

    const message = await Message.create({
      chatRoom:       room._id,
      sender:         req.user._id,
      content,
      type:           "text",
      isAdminMessage: isAdmin,
      replyTo:        replyToId || null,
    });

    const populated = await populateMessage(Message.findById(message._id));
    const io = req.app.get("io");
    if (io) io.to("main_room").emit("receive_message", populated);

    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Send image message ────────────────────────────────────────────
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

    const { replyToId } = req.body;

    // Upload directly from memory buffer to Cloudinary
    const result = await uploadToCloudinary(req.file.buffer);

    const message = await Message.create({
      chatRoom:       room._id,
      sender:         req.user._id,
      content:        "📷 Image",
      type:           "image",
      imageUrl:       result.secure_url,
      isAdminMessage: isAdmin,
      replyTo:        replyToId || null,
    });

    const populated = await populateMessage(Message.findById(message._id));
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

    const existingIndex = message.reactions.findIndex(
      (r) => r.user.toString() === userId.toString() && r.emoji === emoji
    );
    if (existingIndex >= 0) message.reactions.splice(existingIndex, 1);
    else message.reactions.push({ user: userId, emoji });

    await message.save();

    const populated = await populateMessage(Message.findById(message._id));
    const io = req.app.get("io");
    if (io) io.to("main_room").emit("message_reaction_updated", populated);

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Delete message ────────────────────────────────────────────────
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

// ── Admin: Clear messages ─────────────────────────────────────────
export const clearMessages = async (req, res) => {
  try {
    const { days } = req.body;
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

// ── Admin: Toggle room ────────────────────────────────────────────
export const toggleChatRoom = async (req, res) => {
  try {
    const { close } = req.body;
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

// ── Admin: Ban user ───────────────────────────────────────────────
export const banUser = async (req, res) => {
  try {
    const { userId, hours, days, reason } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!hours && !days) return res.status(400).json({ error: "hours or days is required" });

    const totalMs   = ((Number(hours) || 0) + (Number(days) || 0) * 24) * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + totalMs);

    const room = await getGlobalRoom();
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

// ── Admin: Room info ──────────────────────────────────────────────
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
