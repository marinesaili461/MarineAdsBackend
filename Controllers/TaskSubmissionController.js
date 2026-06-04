// Controllers/TaskSubmissionController.js
import TaskSubmission from "../models/TaskSubmission.js";

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

// Approve submission (Admin)
export const approveSubmission = async (req, res) => {
  try {
    const submission = await TaskSubmission.findById(req.params.id);
    if (!submission) return res.status(404).json({ message: "Submission not found" });

    submission.status = "approved";
    await submission.save();

    res.json({ message: "Submission approved", submission });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Reject submission (Admin)
export const rejectSubmission = async (req, res) => {
  try {
    const { reason } = req.body;
    const submission = await TaskSubmission.findById(req.params.id);
    if (!submission) return res.status(404).json({ message: "Submission not found" });

    submission.status = "rejected";
    submission.rejectionReason = reason || "Not valid";
    await submission.save();

    res.json({ message: "Submission rejected", submission });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
