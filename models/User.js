import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const userSchema = new mongoose.Schema(
  {
    uniqueId: { type: String, default: () => uuidv4(), unique: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    country: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true, minlength: 6 },
    isVerified: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    agreedToTerms: { type: Boolean, required: true },
    role: { type: String, enum: ["user", "moderator", "admin", "superadmin"], default: "user" },
    signupBonusGiven: { type: Boolean, default: false },
    referralCode: { type: String, unique: true },
    referrals: { type: Number, default: 0 },
    referralLevel: { type: Number, default: 0 },
    badge: { type: String, default: null },
    onlineStatus: { type: Boolean, default: false },
    lastCheckIn: { type: Date },
    hiddenSections: { type: [String], default: [] },
  },
  { timestamps: true }
);

userSchema.pre("save", function (next) {
  if (!this.referralCode) {
    this.referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

export default mongoose.model("User", userSchema);
