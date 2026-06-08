import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import multer from "multer";
import Badge from "../models/Badge.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Multer memory storage ─────────────────────────────────────────
export const badgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Images only"));
    cb(null, true);
  },
});

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "marinecash/badges", transformation: [{ width: 128, height: 128, crop: "fill" }] },
      (err, result) => { if (err) return reject(err); resolve(result); }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// ── Create badge ──────────────────────────────────────────────────
export const createBadge = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Image required" });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Name required" });

    const result = await uploadToCloudinary(req.file.buffer);
    const badge = await Badge.create({
      name: name.trim(),
      imageUrl: result.secure_url,
      publicId: result.public_id,
    });
    res.status(201).json(badge);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get all badges ────────────────────────────────────────────────
export const getBadges = async (req, res) => {
  try {
    const badges = await Badge.find().sort({ createdAt: -1 });
    res.json(badges);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Edit badge (name and/or image) ───────────────────────────────
// PATCH /api/badges/:id
// Accepts multipart: optional "image" file, optional "name" body field.
// New image is uploaded to Cloudinary first, then old publicId is destroyed.
// Since users store an ObjectId ref to Badge, the updated imageUrl is
// immediately reflected everywhere — no User documents need touching.
export const editBadge = async (req, res) => {
  try {
    const badge = await Badge.findById(req.params.id);
    if (!badge) return res.status(404).json({ message: "Badge not found" });

    if (req.body.name?.trim()) badge.name = req.body.name.trim();

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      if (badge.publicId) {
        try { await cloudinary.uploader.destroy(badge.publicId); } catch (_) {}
      }
      badge.imageUrl = result.secure_url;
      badge.publicId = result.public_id;
    }

    await badge.save();
    res.json(badge);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Toggle badge visibility (hide / show) ────────────────────────
// PATCH /api/badges/:id/visibility
// Sets badge.hidden = !badge.hidden.
// BadgeIcon on the frontend checks badge.hidden and renders nothing if true,
// so all users who have this badge assigned will instantly stop seeing it
// (or start seeing it again) without any User doc changes.
export const toggleBadgeVisibility = async (req, res) => {
  try {
    const badge = await Badge.findById(req.params.id);
    if (!badge) return res.status(404).json({ message: "Badge not found" });

    badge.hidden = !badge.hidden;
    await badge.save();
    res.json({ message: badge.hidden ? "Badge hidden" : "Badge visible", badge });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Delete badge ──────────────────────────────────────────────────
export const deleteBadge = async (req, res) => {
  try {
    const badge = await Badge.findById(req.params.id);
    if (!badge) return res.status(404).json({ message: "Badge not found" });

    if (badge.publicId) await cloudinary.uploader.destroy(badge.publicId);
    await badge.deleteOne();

    // Remove badge ref from any users who had it
    await User.updateMany({ badge: badge._id }, { $set: { badge: null } });

    res.json({ message: "Badge deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Assign badge to a single user ────────────────────────────────
export const assignBadge = async (req, res) => {
  try {
    const { userId, badgeId } = req.body;
    const user = await User.findByIdAndUpdate(
      userId,
      { badge: badgeId || null },
      { new: true }
    ).select("-password").populate({ path: "badge", select: "name imageUrl hidden" });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Badge assigned", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Bulk reassign: swap badge A → badge B across all users ────────
// POST /api/badges/bulk-reassign
// Body: { fromBadgeId, toBadgeId }
// toBadgeId can be "" or null to just strip the badge from all holders.
// Returns count of affected users.
export const bulkReassign = async (req, res) => {
  try {
    const { fromBadgeId, toBadgeId } = req.body;
    if (!fromBadgeId) return res.status(400).json({ message: "fromBadgeId required" });

    const newBadge = toBadgeId || null;

    // Validate target badge exists if provided
    if (newBadge) {
      const exists = await Badge.findById(newBadge);
      if (!exists) return res.status(404).json({ message: "Target badge not found" });
    }

    const result = await User.updateMany(
      { badge: fromBadgeId },
      { $set: { badge: newBadge } }
    );

    res.json({ message: "Bulk reassign complete", affected: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Get users with filters for badge allocation ───────────────────
export const getUsersForBadge = async (req, res) => {
  try {
    const {
      search,
      minReferrals, maxReferrals,
      minEarned,    maxEarned,
      hasBadge,
      sortBy = "createdAt",
      page = 1,
      limit = 20,
    } = req.query;

    const userFilter = {};
    if (search) userFilter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email:    { $regex: search, $options: "i" } },
    ];
    if (minReferrals || maxReferrals) {
      userFilter.referrals = {};
      if (minReferrals) userFilter.referrals.$gte = Number(minReferrals);
      if (maxReferrals) userFilter.referrals.$lte = Number(maxReferrals);
    }
    if (hasBadge === "true")  userFilter.badge = { $ne: null };
    if (hasBadge === "false") userFilter.badge = null;

    let users = await User.find(userFilter)
      .select("-password")
      .populate({ path: "badge", select: "name imageUrl hidden" })
      .sort({ createdAt: -1 })
      .lean();

    // Join wallet data
    const userIds = users.map((u) => u._id);
    const wallets = await Wallet.find({ user: { $in: userIds } }).lean();
    const walletMap = wallets.reduce((acc, w) => {
      acc[w.user.toString()] = w;
      return acc;
    }, {});

    users = users.map((u) => ({
      ...u,
      totalEarned:    walletMap[u._id.toString()]?.totalEarned    || 0,
      tasksCompleted: walletMap[u._id.toString()]?.tasksCompleted || 0,
    }));

    // Wallet-based filters
    if (minEarned) users = users.filter((u) => u.totalEarned >= Number(minEarned));
    if (maxEarned) users = users.filter((u) => u.totalEarned <= Number(maxEarned));

    // Sorting
    if (sortBy === "earned")    users.sort((a, b) => b.totalEarned    - a.totalEarned);
    if (sortBy === "referrals") users.sort((a, b) => b.referrals      - a.referrals);

    const total     = users.length;
    const start     = (page - 1) * limit;
    const paginated = users.slice(start, start + Number(limit));

    res.json({ users: paginated, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
