import mongoose from "mongoose";
import Campaign from "../models/Campaign.js";
import Settings from "../models/Settings.js";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";

// ─── Helpers ──────────────────────────────────────────────────────
const getSettings = () => Settings.getSingleton();

const creditUser = async (userId, amount, type, meta, session) => {
  const wallet = await Wallet.findOne({ user: userId }).session(session);
  if (!wallet) throw new Error("Wallet not found for user " + userId);
  wallet.balance += amount;
  wallet.totalEarned = (wallet.totalEarned || 0) + amount;
  wallet.earnedToday = (wallet.earnedToday || 0) + amount;
  await wallet.save({ session });
  await WalletTransaction.create(
    [{ user: userId, type, amount, fee: 0, netAmount: amount, status: "completed", meta }],
    { session }
  );
  return wallet;
};

// ─── User: Create campaign (goes to pending_approval) ─────────────
export const createCampaign = async (req, res) => {
  try {
    const {
      title, description, category, payPerTask, maxEarners,
      perUserLimit = 1, instructions, targetUrl, exampleImageUrls = [], expiresAt,
    } = req.body;

    if (!title || !description || !category || !payPerTask || !maxEarners)
      return res.status(400).json({ message: "title, description, category, payPerTask, and maxEarners are required." });

    const settings = await getSettings();
    const feePct = settings.campaignFeePct ?? settings.platformFeePct ?? 0;

    // Min pay check — admin can set per category; if blank, user can enter anything
    const catMin = settings.categoryMinimums?.get?.(category) ?? settings.minPayGlobal ?? 0;
    if (catMin > 0 && payPerTask < catMin)
      return res.status(400).json({ message: `Minimum pay for "${category}" is $${Number(catMin).toFixed(3)}` });

    const payoutBudget = parseFloat((payPerTask * maxEarners).toFixed(4));
    const feeAmount = parseFloat((payoutBudget * feePct / 100).toFixed(4));
    const escrowRequired = parseFloat((payoutBudget + feeAmount).toFixed(4));

    const autoApproveDays = settings.autoApproveDays ?? 3;

    const campaign = await Campaign.create({
      title, description, category,
      payPerTask, platformFeePctAtCreate: feePct,
      maxEarners, perUserLimit, instructions, targetUrl,
      exampleImageUrls,
      poster: req.user._id,
      payoutBudget, feeAmount, escrowRequired,
      status: "pending_approval",
      approvalsCloseAt: new Date(Date.now() + autoApproveDays * 24 * 60 * 60 * 1000),
      expiresAt: expiresAt || undefined,
    });

    res.status(201).json({ message: "Campaign submitted for admin review.", campaign });
  } catch (e) {
    console.error("createCampaign:", e);
    res.status(500).json({ message: e.message });
  }
};

// ─── User: Fund & activate (after admin approval) ─────────────────
export const fundAndActivate = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const campaign = await Campaign.findById(req.params.id).session(session);
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.poster.toString() !== req.user._id.toString()) throw new Error("Not campaign owner");
    if (!["draft", "paused", "exhausted"].includes(campaign.status))
      throw new Error("Campaign must be in draft, paused, or exhausted state to fund.");

    const wallet = await Wallet.findOne({ user: req.user._id }).session(session);
    if (!wallet) throw new Error("Wallet not found");

    // For top-up (exhausted): recalculate with new allocation from request
    let escrowNeeded = campaign.escrowRequired;
    if (campaign.status === "exhausted" && req.body.topUpAmount) {
      const settings = await getSettings();
      const feePct = campaign.platformFeePctAtCreate;
      const topUp = Number(req.body.topUpAmount);
      const fee = parseFloat((topUp * feePct / 100).toFixed(4));
      const newPayout = parseFloat((topUp - fee).toFixed(4));
      escrowNeeded = topUp;

      if (wallet.balance < escrowNeeded) throw new Error("Insufficient balance.");

      wallet.balance -= escrowNeeded;
      wallet.locked = (wallet.locked || 0) + escrowNeeded;
      await wallet.save({ session });

      await WalletTransaction.create(
        [{ user: req.user._id, type: "escrow_lock", amount: escrowNeeded, meta: { campaignId: campaign._id, topUp: true } }],
        { session }
      );

      campaign.payoutBudget += newPayout;
      campaign.escrowRequired += escrowNeeded;
      campaign.feeAmount += fee;
      campaign.escrowLocked += escrowNeeded;
      campaign.maxEarners = Math.floor(campaign.payoutBudget / campaign.payPerTask);
      campaign.status = "active";
      await campaign.save({ session });
      await session.commitTransaction();
      return res.json({ message: "Campaign topped up & reactivated.", campaign });
    }

    if (wallet.balance < escrowNeeded) throw new Error("Insufficient balance. Please deposit.");

    wallet.balance -= escrowNeeded;
    wallet.locked = (wallet.locked || 0) + escrowNeeded;
    await wallet.save({ session });

    await WalletTransaction.create(
      [{ user: req.user._id, type: "escrow_lock", amount: escrowNeeded, meta: { campaignId: campaign._id } }],
      { session }
    );

    campaign.status = "active";
    campaign.escrowLocked = escrowNeeded;
    await campaign.save({ session });

    await session.commitTransaction();
    res.json({ message: "Campaign funded & activated.", campaign });
  } catch (e) {
    await session.abortTransaction();
    res.status(400).json({ message: e.message });
  } finally {
    session.endSession();
  }
};

// ─── User: Pause ──────────────────────────────────────────────────
export const pauseCampaign = async (req, res) => {
  try {
    const c = await Campaign.findById(req.params.id);
    if (!c) return res.status(404).json({ message: "Not found" });
    if (c.poster.toString() !== req.user._id.toString()) return res.status(403).json({ message: "Forbidden" });
    if (c.status !== "active") return res.status(400).json({ message: "Only active campaigns can be paused" });
    c.status = "paused";
    await c.save();
    res.json({ message: "Campaign paused.", campaign: c });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── User: Resume ─────────────────────────────────────────────────
export const resumeCampaign = async (req, res) => {
  try {
    const c = await Campaign.findById(req.params.id);
    if (!c) return res.status(404).json({ message: "Not found" });
    if (c.poster.toString() !== req.user._id.toString()) return res.status(403).json({ message: "Forbidden" });
    if (c.status !== "paused") return res.status(400).json({ message: "Only paused campaigns can be resumed" });
    c.status = "active";
    await c.save();
    res.json({ message: "Campaign resumed.", campaign: c });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── User: Stop & refund remaining escrow ─────────────────────────
export const stopCampaign = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const c = await Campaign.findById(req.params.id).session(session);
    if (!c) throw new Error("Not found");
    if (c.poster.toString() !== req.user._id.toString()) throw new Error("Forbidden");
    if (!["active", "paused"].includes(c.status)) throw new Error("Only active or paused campaigns can be stopped");

    const remaining = c.escrowLocked;
    if (remaining > 0) {
      const wallet = await Wallet.findOne({ user: c.poster }).session(session);
      wallet.locked = Math.max(0, (wallet.locked || 0) - remaining);
      wallet.balance += remaining;
      await wallet.save({ session });
      await WalletTransaction.create(
        [{ user: c.poster, type: "escrow_release", amount: remaining, meta: { campaignId: c._id, reason: "stopped" } }],
        { session }
      );
      c.refundedAmount += remaining;
      c.escrowLocked = 0;
    }

    c.status = "stopped";
    await c.save({ session });
    await session.commitTransaction();
    res.json({ message: "Campaign stopped. Remaining escrow refunded.", campaign: c });
  } catch (e) {
    await session.abortTransaction();
    res.status(400).json({ message: e.message });
  } finally { session.endSession(); }
};

// ─── User: Get own campaigns ───────────────────────────────────────
export const getMyCampaigns = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const q = { poster: req.user._id };
    if (status) q.status = status;
    const [items, total] = await Promise.all([
      Campaign.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).select("-submissions"),
      Campaign.countDocuments(q),
    ]);
    res.json({ items, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── User/Public: List active campaigns ───────────────────────────
export const listActive = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 10 } = req.query;
    const q = { status: "active" };
    if (category) q.category = category;
    if (search) q.title = { $regex: search, $options: "i" };
    const [items, total] = await Promise.all([
      Campaign.find(q)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .select("-submissions")
        .populate("poster", "fullName"),
      Campaign.countDocuments(q),
    ]);
    res.json({ items, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── User: Get single campaign (with user's own submission) ────────
export const getCampaign = async (req, res) => {
  try {
    const c = await Campaign.findById(req.params.id).populate("poster", "fullName");
    if (!c) return res.status(404).json({ message: "Campaign not found" });
    if (c.status !== "active" && c.poster._id.toString() !== req.user?._id?.toString())
      return res.status(404).json({ message: "Campaign not found" });

    const mySubmission = req.user
      ? c.submissions.find((s) => s.user.toString() === req.user._id.toString())
      : null;

    const { submissions, ...rest } = c.toObject();
    res.json({ campaign: rest, mySubmission: mySubmission || null });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── User: Submit proof ───────────────────────────────────────────
export const submitProof = async (req, res) => {
  try {
    const { proofText, proofUrl, proofImageUrls = [], extraFields = {} } = req.body;
    const c = await Campaign.findById(req.params.id);
    if (!c) return res.status(404).json({ message: "Campaign not found" });
    if (c.status !== "active") return res.status(400).json({ message: "Campaign is not active" });
    if (c.completedCount >= c.maxEarners) return res.status(400).json({ message: "Campaign is full" });
    if (c.poster.toString() === req.user._id.toString())
      return res.status(400).json({ message: "You cannot submit to your own campaign" });

    const myCount = c.submissions.filter((s) => s.user.toString() === req.user._id.toString()).length;
    if (myCount >= c.perUserLimit) return res.status(400).json({ message: "You have reached the submission limit for this campaign" });

    c.submissions.push({ user: req.user._id, proofText, proofUrl, proofImageUrls, extraFields });
    c.pendingCount += 1;
    await c.save();
    res.status(201).json({ message: "Proof submitted. Awaiting review." });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── Shared: Approve a submission (poster or admin) ───────────────
const approveSubmission = async (campaign, sub, reviewerId, session) => {
  const earnerId = sub.user;
  await creditUser(earnerId, campaign.payPerTask, "payout",
    { campaignId: campaign._id, submissionId: sub._id }, session);

  sub.status = "approved";
  sub.reviewedBy = reviewerId;
  sub.reviewedAt = new Date();
  campaign.pendingCount = Math.max(0, campaign.pendingCount - 1);
  campaign.approvedCount += 1;
  campaign.completedCount += 1;
  campaign.escrowLocked -= campaign.payPerTask;
  campaign.payoutBudget -= campaign.payPerTask;

  if (campaign.completedCount >= campaign.maxEarners || campaign.payoutBudget <= 0) {
    // Refund any remaining locked escrow to poster
    if (campaign.escrowLocked > 0) {
      const posterWallet = await Wallet.findOne({ user: campaign.poster }).session(session);
      posterWallet.locked = Math.max(0, (posterWallet.locked || 0) - campaign.escrowLocked);
      posterWallet.balance += campaign.escrowLocked;
      await posterWallet.save({ session });
      await WalletTransaction.create(
        [{ user: campaign.poster, type: "escrow_release", amount: campaign.escrowLocked, meta: { campaignId: campaign._id, reason: "exhausted" } }],
        { session }
      );
      campaign.refundedAmount += campaign.escrowLocked;
      campaign.escrowLocked = 0;
    }
    campaign.status = "exhausted";
  }
};

// ─── User (poster): Review a submission ───────────────────────────
export const reviewSubmissionByPoster = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { action, rejectionReason } = req.body;
    const { id, submissionId } = req.params;

    if (!["approve", "reject"].includes(action))
      throw new Error("action must be 'approve' or 'reject'");
    if (action === "reject" && !rejectionReason)
      throw new Error("rejectionReason is required when rejecting");

    const c = await Campaign.findById(id).session(session);
    if (!c) throw new Error("Campaign not found");
    if (c.poster.toString() !== req.user._id.toString()) throw new Error("Forbidden");

    const sub = c.submissions.id(submissionId);
    if (!sub) throw new Error("Submission not found");
    if (sub.status !== "pending") throw new Error("Submission already reviewed");

    if (action === "reject") {
      sub.status = "rejected";
      sub.rejectionReason = rejectionReason;
      sub.reviewedBy = req.user._id;
      sub.reviewedAt = new Date();
      c.pendingCount = Math.max(0, c.pendingCount - 1);
      c.rejectedCount += 1;
      await c.save({ session });
      await session.commitTransaction();
      return res.json({ message: "Submission rejected." });
    }

    await approveSubmission(c, sub, req.user._id, session);
    await c.save({ session });
    await session.commitTransaction();
    res.json({ message: "Submission approved & user paid." });
  } catch (e) {
    await session.abortTransaction();
    res.status(400).json({ message: e.message });
  } finally { session.endSession(); }
};

// ─── Admin: List campaigns by status ──────────────────────────────
export const adminListCampaigns = async (req, res) => {
  try {
    const { status = "pending_approval", category, search, page = 1, limit = 20 } = req.query;
    const q = {};
    if (status) q.status = status;
    if (category) q.category = category;
    if (search) q.title = { $regex: search, $options: "i" };
    const [items, total] = await Promise.all([
      Campaign.find(q)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .select("-submissions")
        .populate("poster", "fullName email"),
      Campaign.countDocuments(q),
    ]);
    res.json({ items, total, page: +page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── Admin: Approve campaign (moves to draft, poster must fund) ────
export const adminApproveCampaign = async (req, res) => {
  try {
    const c = await Campaign.findById(req.params.id);
    if (!c) return res.status(404).json({ message: "Campaign not found" });
    if (c.status !== "pending_approval")
      return res.status(400).json({ message: "Campaign is not awaiting approval" });
    c.status = "draft";
    c.adminReviewedBy = req.user._id;
    c.adminReviewedAt = new Date();
    await c.save();
    res.json({ message: "Campaign approved. Owner can now fund it.", campaign: c });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── Admin: Reject campaign ────────────────────────────────────────
export const adminRejectCampaign = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: "Rejection reason is required" });
    const c = await Campaign.findById(req.params.id);
    if (!c) return res.status(404).json({ message: "Campaign not found" });
    if (c.status !== "pending_approval")
      return res.status(400).json({ message: "Campaign is not awaiting approval" });
    c.status = "rejected";
    c.adminReviewedBy = req.user._id;
    c.adminReviewedAt = new Date();
    c.adminRejectionReason = reason;
    await c.save();
    res.json({ message: "Campaign rejected.", campaign: c });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── Admin: Review a submission ────────────────────────────────────
export const adminReviewSubmission = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { action, rejectionReason } = req.body;
    const { id, submissionId } = req.params;

    if (!["approve", "reject"].includes(action))
      throw new Error("action must be 'approve' or 'reject'");
    if (action === "reject" && !rejectionReason)
      throw new Error("rejectionReason is required when rejecting");

    const c = await Campaign.findById(id).session(session);
    if (!c) throw new Error("Campaign not found");

    const sub = c.submissions.id(submissionId);
    if (!sub) throw new Error("Submission not found");
    if (sub.status !== "pending") throw new Error("Submission already reviewed");

    if (action === "reject") {
      sub.status = "rejected";
      sub.rejectionReason = rejectionReason;
      sub.reviewedBy = req.user._id;
      sub.reviewedAt = new Date();
      c.pendingCount = Math.max(0, c.pendingCount - 1);
      c.rejectedCount += 1;
      await c.save({ session });
      await session.commitTransaction();
      return res.json({ message: "Submission rejected." });
    }

    await approveSubmission(c, sub, req.user._id, session);
    await c.save({ session });
    await session.commitTransaction();
    res.json({ message: "Submission approved & user paid." });
  } catch (e) {
    await session.abortTransaction();
    res.status(400).json({ message: e.message });
  } finally { session.endSession(); }
};

// ─── Admin: Get campaign with all submissions ──────────────────────
export const adminGetCampaign = async (req, res) => {
  try {
    const c = await Campaign.findById(req.params.id)
      .populate("poster", "fullName email")
      .populate("adminReviewedBy", "fullName")
      .populate("submissions.user", "fullName email")
      .populate("submissions.reviewedBy", "fullName");
    if (!c) return res.status(404).json({ message: "Campaign not found" });
    res.json(c);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ─── Cron: Auto-approve overdue pending submissions ────────────────
export const autoApproveOverdue = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const settings = await getSettings();
    const days = settings.autoApproveDays ?? 3;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const campaigns = await Campaign.find({ status: "active" }).session(session);
    let totalAutoApproved = 0;

    for (const c of campaigns) {
      let changed = false;
      for (const sub of c.submissions) {
        if (sub.status === "pending" && sub.submittedAt <= cutoff) {
          await approveSubmission(c, sub, null, session);
          sub.status = "auto_approved";
          changed = true;
          totalAutoApproved++;
        }
      }
      if (changed) await c.save({ session });
    }

    await session.commitTransaction();
    console.log(`✅ Auto-approved ${totalAutoApproved} overdue submissions`);
  } catch (e) {
    await session.abortTransaction();
    console.error("autoApproveOverdue error:", e.message);
  } finally { session.endSession(); }
};
