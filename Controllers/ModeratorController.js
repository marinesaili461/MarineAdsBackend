import User from "../models/User.js";
import Task from "../models/Task.js";

export const reviewTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json({ message: "Task reviewed", task });
  } catch (error) { res.status(500).json({ message: "Error reviewing task", error: error.message }); }
};

export const approveTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, { status: "approved" }, { new: true });
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json({ message: "Task approved", task });
  } catch (error) { res.status(500).json({ message: "Error approving task", error: error.message }); }
};

export const rejectTask = async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, { status: "rejected" }, { new: true });
    if (!task) return res.status(404).json({ message: "Task not found" });
    res.json({ message: "Task rejected", task });
  } catch (error) { res.status(500).json({ message: "Error rejecting task", error: error.message }); }
};

export const viewReports = async (req, res) => {
  try {
    res.json({ message: "Reports retrieved successfully" });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

export const viewUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json({ message: "Users retrieved successfully", users });
  } catch (error) { res.status(500).json({ message: "Error fetching users", error: error.message }); }
};
