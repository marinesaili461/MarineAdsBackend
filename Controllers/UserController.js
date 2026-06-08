import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import multer from "multer";
import User from "../models/User.js";

// ── Cloudinary config ─────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Multer — memory only ──────────────────────────────────────────
export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Images only"));
    cb(null, true);
  },
});

// ── Upload buffer → Cloudinary ────────────────────────────────────
function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "marinecash/avatars", transformation: [{ width: 300, height: 300, crop: "fill", gravity: "face" }] },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// ── Get profile ───────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ── Update profile (text fields) ──────────────────────────────────
export const updateProfile = async (req, res) => {
  try {
    // Prevent role/password escalation via this route
    const { fullName, phone, country } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { fullName, phone, country },
      { new: true, runValidators: true }
    ).select("-password");
    res.status(200).json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: "Update failed" });
  }
};

// ── Upload avatar ─────────────────────────────────────────────────
export const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image uploaded." });

    const result = await uploadToCloudinary(req.file.buffer);

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { photo: result.secure_url },
      { new: true }
    ).select("-password");

    res.status(200).json({ photo: updatedUser.photo, user: updatedUser });
  } catch (err) {
    res.status(500).json({ message: err.message || "Avatar upload failed." });
  }
};

// ── Admin: Get all users ──────────────────────────────────────────
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Admin: Update user role ───────────────────────────────────────
export const updateUserRole = async (req, res) => {
  try {
    const { userId, role } = req.body;
    if (!["user", "moderator", "admin"].includes(role))
      return res.status(400).json({ message: "Invalid role" });
    const updatedUser = await User.findByIdAndUpdate(userId, { role }, { new: true });
    if (!updatedUser) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User role updated", user: updatedUser });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
