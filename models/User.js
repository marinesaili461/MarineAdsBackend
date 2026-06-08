import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const userSchema = new mongoose.Schema(
  {
    uniqueId:          { type: String, default: () => uuidv4(), unique: true },
    fullName:          { type: String, required: true, trim: true },
    email:             { type: String, required: true, unique: true, lowercase: true },
    gender:            { type: String, enum: ["male", "female", "prefer_not_to_say"], required: true },
    country:           { type: String, default: "Unknown" },
    phoneCountry:      { type: String, default: null },
    countryMismatch:   { type: Boolean, default: false },
    timezone:          { type: String, default: "UTC" },
    phone:             { type: String, required: true, unique: true },
    password:          { type: String, required: true, minlength: 6 },
    isVerified:        { type: Boolean, default: false },
    isBlocked:         { type: Boolean, default: false },
    agreedToTerms:     { type: Boolean, required: true },
    role:              { type: String, enum: ["user", "moderator", "admin", "superadmin"], default: "user" },
    signupBonusGiven:  { type: Boolean, default: false },
    referralCode:      { type: String, unique: true },
    referrals:         { type: Number, default: 0 },
    referralLevel:     { type: Number, default: 0 },
    badge:             { type: String, default: null },
    onlineStatus:      { type: Boolean, default: false },
    lastCheckIn:       { type: Date },
    lastCheckInDate:   { type: String, default: null }, // "2026-06-08" in user's local tz
    hiddenSections:    { type: [String], default: [] },
    photo: { type: String, default: null },
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
