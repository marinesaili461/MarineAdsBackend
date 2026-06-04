import mongoose from "mongoose";

const tokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  token: { type: String, required: true },
  type: { type: String, enum: ["verify", "reset"], required: true },
  expiresAt: { type: Date, required: true },
});

export default mongoose.model("Token", tokenSchema);
