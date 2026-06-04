import RewardCode from "../models/RewardCode.js";
import Wallet from "../models/Wallet.js";

const generateRandomCode = (length = 8) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
};

export const createRewardCode = async (req, res) => {
  try {
    const { rewardType, fixedReward, minReward, maxReward, maxUsers, expiresAt, customCode } = req.body;
    const code = customCode || generateRandomCode(8);
    const existing = await RewardCode.findOne({ code });
    if (existing) return res.status(400).json({ message: "Code already exists. Try again." });

    const newCode = await RewardCode.create({
      code, rewardType,
      fixedReward: rewardType === "fixed" ? fixedReward : undefined,
      minReward: rewardType === "random" ? minReward : undefined,
      maxReward: rewardType === "random" ? maxReward : undefined,
      maxUsers, expiresAt,
    });
    res.status(201).json({ message: "Reward code created successfully", code: newCode });
  } catch (error) {
    console.error("Error creating reward code:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const deactivateRewardCode = async (req, res) => {
  try {
    const rewardCode = await RewardCode.findById(req.params.codeId);
    if (!rewardCode) return res.status(404).json({ message: "Reward code not found" });
    rewardCode.isActive = false;
    await rewardCode.save();
    res.status(200).json({ message: `Reward code ${rewardCode.code} has been deactivated`, code: rewardCode });
  } catch (error) {
    console.error("Error deactivating reward code:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const listRewardCodes = async (req, res) => {
  try {
    const { rewardType, status, search, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (rewardType) filter.rewardType = rewardType.toLowerCase();
    if (status === "active") filter.isActive = true;
    if (status === "deactivated") filter.isActive = false;
    if (status === "expired") filter.expiresAt = { $lte: new Date() };
    if (search) filter.code = { $regex: search, $options: "i" };

    const skip = (page - 1) * limit;
    const rewardCodes = await RewardCode.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await RewardCode.countDocuments(filter);
    res.status(200).json({ total, page: Number(page), limit: Number(limit), rewardCodes });
  } catch (error) {
    console.error("Error listing reward codes:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const redeemRewardCode = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user._id;
    const rewardCode = await RewardCode.findOne({ code });
    if (!rewardCode) return res.status(404).json({ message: "Invalid reward code" });
    if (!rewardCode.isActive) return res.status(400).json({ message: "❌ This reward code has already been fully redeemed." });
    if (rewardCode.expiresAt && new Date() > rewardCode.expiresAt) return res.status(400).json({ message: "❌ This reward code has expired." });
    if (rewardCode.redeemedCount >= rewardCode.maxUsers) {
      rewardCode.isActive = false;
      await rewardCode.save();
      return res.status(400).json({ message: "❌ This reward code has already been fully redeemed." });
    }
    const alreadyRedeemed = rewardCode.redeemedBy.find((r) => r.userId.toString() === userId.toString());
    if (alreadyRedeemed) return res.status(400).json({ message: "You have already redeemed this code." });

    let amount;
    if (rewardCode.rewardType === "fixed") {
      amount = rewardCode.fixedReward;
    } else {
      amount = Math.random() * (rewardCode.maxReward - rewardCode.minReward) + rewardCode.minReward;
      amount = Number(amount.toFixed(3));
    }

    let userWallet = await Wallet.findOne({ user: userId });
    let updatedBalance;
    if (userWallet) {
      userWallet.balance += amount;
      await userWallet.save();
      updatedBalance = userWallet.balance;
    } else {
      const newWallet = await Wallet.create({ user: userId, balance: amount });
      updatedBalance = newWallet.balance;
    }

    rewardCode.redeemedBy.push({ userId, amount });
    rewardCode.redeemedCount += 1;
    if (rewardCode.redeemedCount >= rewardCode.maxUsers) rewardCode.isActive = false;
    await rewardCode.save();

    res.status(200).json({ message: "Reward redeemed successfully", amount, newBalance: updatedBalance });
  } catch (error) {
    console.error("Error redeeming reward code:", error);
    res.status(500).json({ message: "Server error" });
  }
};
