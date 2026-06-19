import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

export const register = async (req, res) => {
  try {
    const { fullName, email, phone, password, confirmPassword } = req.body;

    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match" });

    if (await User.findOne({ phone }))
      return res.status(400).json({ message: "Phone already registered" });

    if (email && (await User.findOne({ email })))
      return res.status(400).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      fullName,
      email,
      phone,
      password: hashedPassword,
      isVerified: true, // skip email verification for this prototype
    });

    await Wallet.create({ user: newUser._id, balance: 0 });

    res.status(201).json({ message: "Account created. You can log in now." });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });
    if (user.isBlocked) return res.status(403).json({ message: "Your account has been suspended." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid email or password" });

    const wallet = await Wallet.findOne({ user: user._id });

    res.json({
      token: generateToken(user._id),
      user: {
        _id: user._id,
        uniqueId: user.uniqueId,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      wallet: { balance: wallet?.balance || 0 },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    const wallet = await Wallet.findOne({ user: user._id });
    res.json({ ...user.toObject(), wallet: { balance: wallet?.balance || 0 } });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
