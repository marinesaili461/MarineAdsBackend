import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatRoom:       { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom", required: true },
    sender:         { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content:        { type: String, required: true },
    type:           { type: String, default: "text" },
    imageUrl:       { type: String, default: null },
    isAdminMessage: { type: Boolean, default: false },
    readStatus:     { type: Boolean, default: false },
    replyTo:        { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
    reactions: [
      {
        user:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        emoji: String,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Message", messageSchema);
