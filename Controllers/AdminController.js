import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";
import Campaign from "../models/Campaign.js";
import Settings from "../models/Settings.js";

export const getAllUsers = async (req, res) => {
  try {
    const { search, role, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
    const users = await User.find(filter).select("-password").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit));
    const total = await User.countDocuments(filter);
    res.json({ users, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const blockUser = async (req, res) => {
  try {
    const { userId, action } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isBlocked = action === "block";
    await user.save();
    res.json({ message: `User ${action}ed successfully` });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const changeRole = async (req, res) => {
  try {
    const { userId, role } = req.body;
    if (!["user", "moderator", "admin", "superadmin"].includes(role))
      return res.status(400).json({ message: "Invalid role" });
    const user = await User.findByIdAndUpdate(userId, { role }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Role updated", user });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const assignBadge = async (req, res) => {
  try {
    const { userId, badge, referralLevel } = req.body;
    const user = await User.findByIdAndUpdate(userId, { badge, referralLevel }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Badge assigned", user });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const updateAdminPermissions = async (req, res) => {
  try {
    const { userId, hiddenSections } = req.body;
    const user = await User.findByIdAndUpdate(userId, { hiddenSections }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Permissions updated", user });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const getAnalytics = async (req, res) => {
  try {
    const [totalUsers, blockedUsers, totalCampaigns, activeCampaigns] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isBlocked: true }),
      Campaign.countDocuments(),
      Campaign.countDocuments({ status: "active" }),
    ]);
    const revenueAgg = await Campaign.aggregate([
      { $match: { status: { $in: ["exhausted", "stopped"] } } },
      { $group: { _id: null, total: { $sum: "$feeAmount" } } },
    ]);
    res.json({ totalUsers, blockedUsers, totalCampaigns, activeCampaigns, totalRevenue: revenueAgg[0]?.total || 0 });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const getSettings = async (req, res) => {
  try {
    const s = await Settings.getSingleton();
    res.json(s);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const updateSettings = async (req, res) => {
  try {
    const s = await Settings.getSingleton();
    const allowed = ["platformFeePct", "offerwallFeePct", "withdrawalFeePct", "minWithdrawal", "withdrawalDays", "signupBonus", "dailyCheckInEnabled", "dailyCheckInAmount", "referralCommissionPct", "referralSystemCutPct", "referralTasksToActivate", "autoApproveDays", "minPayGlobal", "maintenanceMode", "maintenanceMessage"];
    allowed.forEach((key) => { if (req.body[key] !== undefined) s[key] = req.body[key]; });
    await s.save();
    res.json({ message: "Settings updated", settings: s });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const updateBadgeTiers = async (req, res) => {
  try {
    const { tiers } = req.body;
    if (!Array.isArray(tiers)) return res.status(400).json({ message: "tiers must be an array" });
    const s = await Settings.getSingleton();
    s.badgeTiers = tiers;
    await s.save();
    res.json({ message: "Badge tiers updated", tiers: s.badgeTiers });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const addAnnouncement = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: "text is required" });
    const s = await Settings.getSingleton();
    s.announcements.push({ text, isActive: true });
    await s.save();
    res.json({ message: "Announcement added", announcements: s.announcements });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const updateAnnouncement = async (req, res) => {
  try {
    const s = await Settings.getSingleton();
    const item = s.announcements.id(req.params.id);
    if (!item) return res.status(404).json({ message: "Not found" });
    if (req.body.text !== undefined) item.text = req.body.text;
    if (req.body.isActive !== undefined) item.isActive = req.body.isActive;
    await s.save();
    res.json({ message: "Updated", announcements: s.announcements });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const deleteAnnouncement = async (req, res) => {
  try {
    const s = await Settings.getSingleton();
    s.announcements.pull(req.params.id);
    await s.save();
    res.json({ message: "Deleted" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const createPoll = async (req, res) => {
  try {
    const { question, options, expiresAt } = req.body;
    if (!question || !options?.length) return res.status(400).json({ message: "question and options required" });
    const s = await Settings.getSingleton();
    s.polls.push({ question, options: options.map((text) => ({ text, votes: [] })), isActive: true, expiresAt });
    await s.save();
    res.json({ message: "Poll created", polls: s.polls });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const closePoll = async (req, res) => {
  try {
    const s = await Settings.getSingleton();
    const poll = s.polls.id(req.params.id);
    if (!poll) return res.status(404).json({ message: "Poll not found" });
    poll.isActive = false;
    await s.save();
    res.json({ message: "Poll closed" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const deletePoll = async (req, res) => {
  try {
    const s = await Settings.getSingleton();
    s.polls.pull(req.params.id);
    await s.save();
    res.json({ message: "Poll deleted" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const handleCheckIn = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    if (!settings.dailyCheckInEnabled)
      return res.status(403).json({ message: "Daily check-in is currently disabled." });
    if (settings.dailyCheckInAmount == null)
      return res.status(503).json({ message: "Check-in reward not configured by admin yet." });

    const user = await User.findById(req.user._id);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (user.lastCheckIn && new Date(user.lastCheckIn) >= today)
      return res.status(400).json({ message: "Already claimed today. Come back tomorrow!" });

    const wallet = await Wallet.findOne({ user: user._id });
    wallet.balance += settings.dailyCheckInAmount;
    wallet.earnedToday += settings.dailyCheckInAmount;
    await wallet.save();

    await WalletTransaction.create({
      user: user._id,
      type: "daily_checkin",
      amount: settings.dailyCheckInAmount,
      fee: 0,
      netAmount: settings.dailyCheckInAmount,
      status: "completed",
    });

    user.lastCheckIn = new Date();
    await user.save();

    res.json({ message: "Claimed!", amount: settings.dailyCheckInAmount, balance: wallet.balance });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
