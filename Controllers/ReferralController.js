import Referral from "../models/Referral.js";
import Wallet from "../models/Wallet.js";
import Settings from "../models/Settings.js";
import WalletTransaction from "../models/WalletTransaction.js";

export const addReferral = async ({ referrerId, refereeId }) => {
  try {
    if (String(referrerId) === String(refereeId)) return;
    const existing = await Referral.findOne({ referrer: referrerId, referee: refereeId });
    if (existing) return;
    await Referral.create({ referrer: referrerId, referee: refereeId });
  } catch (e) { console.error("addReferral error:", e.message); }
};

export const updateRefereeTasks = async (req, res) => {
  try {
    const { refereeId, tasksCompleted } = req.body;
    const settings = await Settings.getSingleton();
    if (settings.referralTasksToActivate == null)
      return res.status(503).json({ message: "Referral settings not configured yet." });

    const referral = await Referral.findOne({ referee: refereeId });
    if (!referral) return res.status(404).json({ message: "Referral not found" });

    referral.tasksCompletedByReferee = tasksCompleted;
    if (tasksCompleted >= settings.referralTasksToActivate) referral.status = "active";
    await referral.save();
    res.json({ message: "Referral updated", referral });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const addReferralEarnings = async (refereeId, taskEarning) => {
  try {
    const settings = await Settings.getSingleton();
    if (settings.referralCommissionPct == null || settings.referralSystemCutPct == null) {
      console.warn("Referral commission not configured. Skipping.");
      return;
    }
    const referral = await Referral.findOne({ referee: refereeId, status: "active" });
    if (!referral) return;

    const commission = taskEarning * (settings.referralCommissionPct / 100);
    const systemCut = commission * (settings.referralSystemCutPct / 100);
    const netEarning = parseFloat((commission - systemCut).toFixed(4));

    referral.earnedAmount += netEarning;
    await referral.save();

    let wallet = await Wallet.findOne({ user: referral.referrer });
    if (!wallet) wallet = await Wallet.create({ user: referral.referrer, balance: 0 });
    wallet.balance += netEarning;
    wallet.totalEarned += netEarning;
    await wallet.save();

    await WalletTransaction.create({
      user: referral.referrer, type: "referral_bonus", amount: netEarning,
      fee: 0, netAmount: netEarning, status: "completed", meta: { refereeId },
    });
  } catch (e) { console.error("addReferralEarnings error:", e.message); }
};

export const getReferralStats = async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const referrals = await Referral.find({ referrer: req.user._id }).populate("referee", "fullName email");
    const totalEarned = referrals.reduce((acc, r) => acc + r.earnedAmount, 0);
    const totalMembers = referrals.length;
    const tiers = [...settings.badgeTiers].sort((a, b) => b.minReferrals - a.minReferrals);
    const earnedTier = tiers.find((t) => totalMembers >= t.minReferrals);
    res.json({
      totalEarned, totalMembers,
      level: earnedTier ? tiers.length - tiers.indexOf(earnedTier) : 0,
      badge: earnedTier?.badgeImage || null,
      badgeName: earnedTier?.name || null,
      tiers: settings.badgeTiers,
      referrals,
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
