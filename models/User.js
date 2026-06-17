import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const userSchema = new mongoose.Schema(
  {
    uniqueId:   { type: String, default: () => uuidv4(), unique: true },
    fullName:   { type: String, required: true, trim: true },
    email:      { type: String, required: true, unique: true, lowercase: true },
    phone:      { type: String, required: true, unique: true },
    password:   { type: String, required: true, minlength: 6 },
    isVerified: { type: Boolean, default: true },   // no email verification step
    isBlocked:  { type: Boolean, default: false },
    role:       { type: String, enum: ["user", "admin", "superadmin"], default: "user" },
    photo:      { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
