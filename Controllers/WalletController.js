import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";
import Settings from "../models/Settings.js";

export const getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    res.json({ balance: wallet.balance, earnedToday: wallet.earnedToday, totalDeposited: wallet.totalDeposited, totalWithdrawn: wallet.totalWithdrawn, withdrawalHistory: wallet.withdrawalHistory });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const withdraw = async (req, res) => {
  try {
    const { amount } = req.body;
    const settings = await Settings.getSingleton();
    if (settings.minWithdrawal == null) return res.status(503).json({ message: "Withdrawal settings not configured yet." });
    if (settings.withdrawalFeePct == null) return res.status(503).json({ message: "Withdrawal fee not configured yet." });
    if (amount < settings.minWithdrawal) return res.status(400).json({ message: `Minimum withdrawal is $${settings.minWithdrawal}` });

    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    if (wallet.balance < amount) return res.status(400).json({ message: "Insufficient balance" });

    if (settings.withdrawalDays != null) {
      const today = new Date().getDay();
      if (today !== settings.withdrawalDays) return res.status(400).json({ message: "Withdrawals are not open today." });
    }

    const fee = parseFloat(((amount * settings.withdrawalFeePct) / 100).toFixed(4));
    const netAmount = parseFloat((amount - fee).toFixed(4));

    wallet.balance -= amount;
    wallet.totalWithdrawn += netAmount;
    wallet.withdrawalHistory.push({ amount, status: "pending" });
    await wallet.save();

    await WalletTransaction.create({ user: req.user._id, type: "withdrawal", amount, fee, netAmount, status: "pending" });

    res.json({ message: "Withdrawal request submitted", balance: wallet.balance, totalWithdrawn: wallet.totalWithdrawn, withdrawalHistory: wallet.withdrawalHistory });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const deposit = async (req, res) => {
  try {
    const { amount } = req.body;
    const settings = await Settings.getSingleton();
    if (settings.platformFeePct == null) return res.status(503).json({ message: "Deposit fee not configured yet." });

    const fee = parseFloat(((amount * settings.platformFeePct) / 100).toFixed(4));
    const netAmount = parseFloat((amount - fee).toFixed(4));

    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    wallet.balance += netAmount;
    wallet.totalDeposited += amount;
    await wallet.save();

    await WalletTransaction.create({ user: req.user._id, type: "deposit", amount, fee, netAmount, status: "completed" });
    res.json({ message: "Deposit successful", balance: wallet.balance });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const getTransactions = async (req, res) => {
  try {
    const txs = await WalletTransaction.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(txs);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const getWithdrawalHistory = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    res.json(wallet.withdrawalHistory.sort((a, b) => b.date - a.date));
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const editWalletBalance = async (req, res) => {
  try {
    const { userId, newBalance } = req.body;
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    wallet.balance = newBalance;
    await wallet.save();
    res.json({ message: "Balance updated", balance: wallet.balance });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const processWithdrawal = async (req, res) => {
  try {
    const { userId, withdrawalIndex, status } = req.body;
    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    const entry = wallet.withdrawalHistory[withdrawalIndex];
    if (!entry) return res.status(404).json({ message: "Withdrawal entry not found" });
    if (entry.status !== "pending") return res.status(400).json({ message: "Already processed" });
    if (status === "rejected") {
      wallet.balance += entry.amount;
      wallet.totalWithdrawn -= entry.amount;
    }
    entry.status = status;
    await wallet.save();
    res.json({ message: `Withdrawal ${status}`, wallet });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
