import TaskSubmission from "../models/TaskSubmission.js";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";
import Task from "../models/Task.js";

// Create submission (User)
export const createSubmission = async (req, res) => {
  try {
    const { task, proof } = req.body;
    const submission = await TaskSubmission.create({
      task,
      user: req.user._id,
      proof,
    });
    res.status(201).json(submission);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Approve submission (Admin) — credits wallet immediately
export const approveSubmission = async (req, res) => {
  try {
    const submission = await TaskSubmission.findById(req.params.id).populate("task");
    if (!submission) return res.status(404).json({ message: "Submission not found" });
    if (submission.status !== "pending")
      return res.status(400).json({ message: "Submission already reviewed" });

    submission.status = "approved";
    await submission.save();

    const reward = submission.task?.reward ?? 0;
    if (reward > 0) {
      const wallet = await Wallet.findOne({ user: submission.user });
      if (wallet) {
        wallet.balance += reward;
        wallet.totalEarned = (wallet.totalEarned || 0) + reward;
        wallet.earnedToday = (wallet.earnedToday || 0) + reward;
        await wallet.save();
        await WalletTransaction.create({
          user: submission.user,
          type: "payout",
          amount: reward,
          fee: 0,
          netAmount: reward,
          status: "completed",
          meta: { taskId: submission.task?._id, submissionId: submission._id },
        });
      }
    }

    res.json({ message: "Submission approved", submission });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Reject submission (Admin)
export const rejectSubmission = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason?.trim())
      return res.status(400).json({ message: "Rejection reason is required" });

    const submission = await TaskSubmission.findById(req.params.id);
    if (!submission) return res.status(404).json({ message: "Submission not found" });
    if (submission.status !== "pending")
      return res.status(400).json({ message: "Submission already reviewed" });

    submission.status = "rejected";
    submission.rejectionReason = reason;
    await submission.save();

    res.json({ message: "Submission rejected", submission });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
