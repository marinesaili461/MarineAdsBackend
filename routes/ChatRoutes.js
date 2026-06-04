import { Router } from "express";
import { protect } from "../Middlewares/authMiddleware.js";
import Message from "../models/Message.js";
import ChatRoom from "../models/ChatRoom.js";

const router = Router();

async function getGlobalRoom() {
  let room = await ChatRoom.findOne({ name: "Main Room" });
  if (!room) {
    room = new ChatRoom({ name: "Main Room", isGroup: true });
    await room.save();
  }
  return room;
}

router.get("/messages", protect, async (req, res) => {
  try {
    const room = await getGlobalRoom();
    const messages = await Message.find({ chatRoom: room._id }).populate("sender", "fullName badge referralLevel").sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) { res.status(500).json({ message: "Error fetching messages", error: err.message }); }
});

router.delete("/message/:messageId", protect, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (message.sender.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "You can only delete your own messages" });
    await message.deleteOne();
    res.json({ message: "Message deleted" });
  } catch (err) { res.status(500).json({ message: "Error deleting message", error: err.message }); }
});

router.post("/message/:messageId/react", protect, async (req, res) => {
  try {
    const { emoji } = req.body;
    const userId = req.user._id;
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });
    const existingIndex = message.reactions.findIndex((r) => r.user.toString() === userId.toString() && r.emoji === emoji);
    if (existingIndex >= 0) message.reactions.splice(existingIndex, 1);
    else message.reactions.push({ user: userId, emoji });
    await message.save();
    const populated = await message.populate("sender", "fullName badge referralLevel");
    res.json(populated);
  } catch (err) { res.status(500).json({ message: "Error reacting to message", error: err.message }); }
});

export default router;
