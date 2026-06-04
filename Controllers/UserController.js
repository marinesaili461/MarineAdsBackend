import User from "../models/User.js";

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.status(200).json(user);
  } catch (err) { res.status(500).json({ message: "Server error" }); }
};

export const updateProfile = async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(req.user.id, req.body, { new: true, runValidators: true }).select("-password");
    res.status(200).json(updatedUser);
  } catch (err) { res.status(500).json({ message: "Update failed" }); }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json(users);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

export const updateUserRole = async (req, res) => {
  try {
    const { userId, role } = req.body;
    if (!["user", "moderator", "admin"].includes(role))
      return res.status(400).json({ message: "Invalid role" });
    const updatedUser = await User.findByIdAndUpdate(userId, { role }, { new: true });
    if (!updatedUser) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User role updated", user: updatedUser });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
