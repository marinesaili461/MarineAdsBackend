import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";

export const getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });
    res.json({ balance: wallet.balance, totalDeposited: wallet.totalDeposited });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// User submits a deposit request — stays "pending" until admin approves
export const deposit = async (req, res) => {
  try {
    const { amount, mpesaPhone } = req.body;
    if (!amount || !mpesaPhone) return res.status(400).json({ message: "Amount and M-Pesa phone are required" });
    if (Number(amount) < 50) return res.status(400).json({ message: "Minimum deposit is KES 50" });

    const tx = await WalletTransaction.create({
      user: req.user._id,
      type: "deposit",
      amount,
      fee: 0,
      netAmount: amount,
      status: "pending",
      meta: { mpesaPhone },
    });

    res.status(201).json({ message: "Deposit request submitted. Awaiting confirmation.", transaction: tx });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const getTransactions = async (req, res) => {
  try {
    const txs = await WalletTransaction.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(txs);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Admin ──────────────────────────────────────────────
export const getAllDeposits = async (req, res) => {
  try {
    const txs = await WalletTransaction.find({ type: "deposit" })
      .populate("user", "fullName phone email")
      .sort({ createdAt: -1 });
    res.json(txs);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const approveDeposit = async (req, res) => {
  try {
    const tx = await WalletTransaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    if (tx.status !== "pending") return res.status(400).json({ message: "Already processed" });

    const wallet = await Wallet.findOne({ user: tx.user });
    wallet.balance += tx.netAmount;
    wallet.totalDeposited += tx.amount;
    await wallet.save();

    tx.status = "completed";
    await tx.save();

    res.json({ message: "Deposit approved", balance: wallet.balance });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const rejectDeposit = async (req, res) => {
  try {
    const tx = await WalletTransaction.findById(req.params.id);
    if (!tx) return res.status(404).json({ message: "Transaction not found" });
    if (tx.status !== "pending") return res.status(400).json({ message: "Already processed" });

    tx.status = "failed";
    await tx.save();

    res.json({ message: "Deposit rejected" });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
