import User from "../models/User.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(400).json({ message: "User not found" });
    if (user.isVerified) return res.status(400).json({ message: "Already verified" });

    user.isVerified = true;
    user.uniqueId = "MC-" + crypto.randomBytes(3).toString("hex").toUpperCase();
    await user.save();

    res.status(200).json({ message: "Email verified!", uniqueId: user.uniqueId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
