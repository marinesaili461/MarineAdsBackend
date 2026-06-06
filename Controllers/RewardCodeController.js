import RewardCode from "../models/RewardCode.js";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";

const generateRandomCode = (length = 8) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++)
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

// ─── Admin: Create ────────────────────────────────────────────────
export const createRewardCode = async (req, res) => {
  try {
    const {
      rewardType,
      fixedReward,
      minReward,
      maxReward,
      totalAmount,
      maxUsers,
      expiresAt,
      customCode,
    } = req.body;

    // Validate
    if (!rewardType || !["fixed", "random"].includes(rewardType))
      return res.status(400).json({ message: "rewardType must be 'fixed' or 'random'." });
    if (!totalAmount || totalAmount <= 0)
      return res.status(400).json({ message: "totalAmount is required and must be > 0." });
    if (!maxUsers || maxUsers < 1)
      return res.status(400).json({ message: "maxUsers is required and must be >= 1." });

    if (rewardType === "fixed") {
      if (!fixedReward || fixedReward <= 0)
        return res.status(400).json({ message: "fixedReward is required for fixed type." });
    } else {
      if (!minReward || !maxReward || minReward <= 0 || maxReward <= minReward)
        return res
          .status(400)
          .json({ message: "minReward and maxReward are required, and maxReward must be > minReward." });
    }

    const code = (customCode || generateRandomCode(8)).toUpperCase().trim();
    const existing = await RewardCode.findOne({ code });
    if (existing)
      return res.status(400).json({ message: "Code already exists. Try a different one." });

    const newCode = await RewardCode.create({
      code,
      rewardType,
      totalAmount,
      fixedReward: rewardType === "fixed" ? fixedReward : undefined,
      minReward: rewardType === "random" ? minReward : undefined,
      maxReward: rewardType === "random" ? maxReward : undefined,
      maxUsers,
      expiresAt: expiresAt || undefined,
    });

    res.status(201).json({ message: "Reward code created successfully", code: newCode });
  } catch (error) {
    console.error("Error creating reward code:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Admin: List ──────────────────────────────────────────────────
export const listRewardCodes = async (req, res) => {
  try {
    const { rewardType, status, search, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (rewardType) filter.rewardType = rewardType.toLowerCase();
    if (status === "active") filter.isActive = true;
    if (status === "inactive") filter.isActive = false;
    if (status === "expired") filter.expiresAt = { $lte: new Date() };
    if (search) filter.code = { $regex: search.toUpperCase(), $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);
    const [rewardCodes, total] = await Promise.all([
      RewardCode.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate("redeemedBy.userId", "username email"),
      RewardCode.countDocuments(filter),
    ]);

    res.status(200).json({ total, page: Number(page), limit: Number(limit), rewardCodes });
  } catch (error) {
    console.error("Error listing reward codes:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Admin: Deactivate ────────────────────────────────────────────
export const deactivateRewardCode = async (req, res) => {
  try {
    const rewardCode = await RewardCode.findById(req.params.codeId);
    if (!rewardCode) return res.status(404).json({ message: "Reward code not found" });
    rewardCode.isActive = false;
    await rewardCode.save();
    res.status(200).json({ message: `Code ${rewardCode.code} deactivated`, code: rewardCode });
  } catch (error) {
    console.error("Error deactivating reward code:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── Admin: Delete ────────────────────────────────────────────────
export const deleteRewardCode = async (req, res) => {
  try {
    const rewardCode = await RewardCode.findByIdAndDelete(req.params.codeId);
    if (!rewardCode) return res.status(404).json({ message: "Reward code not found" });
    res.status(200).json({ message: `Code ${rewardCode.code} deleted` });
  } catch (error) {
    console.error("Error deleting reward code:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ─── User: Redeem ─────────────────────────────────────────────────
export const redeemRewardCode = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user._id;

    if (!code) return res.status(400).json({ message: "Code is required." });

    const rewardCode = await RewardCode.findOne({ code: code.toUpperCase().trim() });
    if (!rewardCode) return res.status(404).json({ message: "❌ Invalid reward code." });

    if (!rewardCode.isActive)
      return res.status(400).json({ message: "❌ This reward code is no longer active." });

    if (rewardCode.expiresAt && new Date() > rewardCode.expiresAt)
      return res.status(400).json({ message: "❌ This reward code has expired." });

    if (rewardCode.redeemedCount >= rewardCode.maxUsers) {
      rewardCode.isActive = false;
      await rewardCode.save();
      return res.status(400).json({ message: "❌ This reward code has been fully redeemed." });
    }

    const alreadyRedeemed = rewardCode.redeemedBy.some(
      (r) => r.userId.toString() === userId.toString()
    );
    if (alreadyRedeemed)
      return res.status(400).json({ message: "You have already redeemed this code." });

    // ── Calculate reward amount ──────────────────────────────────
    let amount;
    if (rewardCode.rewardType === "fixed") {
      amount = rewardCode.fixedReward;
    } else {
      // Random amount between min and max, rounded to 3 decimal places
      const raw =
        Math.random() * (rewardCode.maxReward - rewardCode.minReward) + rewardCode.minReward;
      amount = Number(raw.toFixed(3));
      // Clamp to maxReward just in case of float drift
      if (amount > rewardCode.maxReward) amount = rewardCode.maxReward;
      if (amount < rewardCode.minReward) amount = rewardCode.minReward;
    }

    // ── Update wallet ────────────────────────────────────────────
    let userWallet = await Wallet.findOne({ user: userId });
    if (userWallet) {
      userWallet.balance += amount;
      userWallet.totalEarned = (userWallet.totalEarned || 0) + amount;
      userWallet.earnedToday = (userWallet.earnedToday || 0) + amount;
      await userWallet.save();
    } else {
      userWallet = await Wallet.create({
        user: userId,
        balance: amount,
        totalEarned: amount,
        earnedToday: amount,
      });
    }

    // ── Record transaction ───────────────────────────────────────
    await WalletTransaction.create({
      user: userId,
      type: "reward_code",
      amount,
      netAmount: amount,
      status: "completed",
      meta: { code: rewardCode.code, rewardType: rewardCode.rewardType },
    });

    // ── Mark as redeemed ─────────────────────────────────────────
    rewardCode.redeemedBy.push({ userId, amount });
    rewardCode.redeemedCount += 1;
    if (rewardCode.redeemedCount >= rewardCode.maxUsers) rewardCode.isActive = false;
    await rewardCode.save();

    res.status(200).json({
      message: "Reward redeemed successfully 🎉",
      amount,
      newBalance: userWallet.balance,
    });
  } catch (error) {
    console.error("Error redeeming reward code:", error);
    res.status(500).json({ message: "Server error" });
  }
};
