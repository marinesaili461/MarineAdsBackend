import mongoose from "mongoose";

const chatBanSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  bannedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  bannedAt:  { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }, // computed from hours or days
  reason:    { type: String },
});

const chatRoomSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true },
    isGroup:  { type: Boolean, default: false },
    members:  [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    isClosed: { type: Boolean, default: false },
    closedAt: { type: Date },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    bans:     [chatBanSchema],
  },
  { timestamps: true }
);

export default mongoose.model("ChatRoom", chatRoomSchema);
