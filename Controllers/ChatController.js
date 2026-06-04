import Message from "../models/Message.js";
import ChatRoom from "../models/ChatRoom.js";

async function getGlobalRoom() {
  let room = await ChatRoom.findOne({ name: "Main Room" });
  if (!room) {
    room = new ChatRoom({ name: "Main Room", isGroup: true });
    await room.save();
  }
  return room;
}

export const sendMessage = async (req, res) => {
  try {
    const { content, type } = req.body;
    const room = await getGlobalRoom();
    const message = await Message.create({ chatRoom: room._id, sender: req.user._id, content, type: type || "text" });
    const populated = await message.populate("sender", "fullName badge referralLevel");
    res.status(201).json(populated);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const getMessages = async (req, res) => {
  try {
    const room = await getGlobalRoom();
    const messages = await Message.find({ chatRoom: room._id }).populate("sender", "fullName badge referralLevel").sort({ createdAt: 1 });
    res.status(200).json(messages);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const deleteMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });
    if (message.sender.toString() !== req.user._id.toString())
      return res.status(403).json({ error: "Not authorized" });
    await message.deleteOne();
    res.status(200).json({ message: "Message deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

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
    const populated = await message.populate("sender", "fullName badge referralLevel");
    res.status(200).json(populated);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
