import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, "Task title is required"] },
    description: { type: String },
    category: { type: String, enum: ["survey", "video", "signup", "social", "offer", "watch", "other"], default: "other" },
    reward: { type: Number, required: true },
    link: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Task", taskSchema);
