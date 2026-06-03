const User    = require("../models/User");
const Token   = require("../models/Token");
const Wallet  = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");
const Settings = require("../models/Settings");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const crypto  = require("crypto");
const sendEmail = require("../Utils/sendEmail");

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

exports.register = async (req, res) => {
  try {
    const { fullName, email, country, phone, password, confirmPassword, agreedToTerms, referralCode } = req.body;

    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match" });

    if (await User.findOne({ email }))
      return res.status(400).json({ message: "Email already registered" });

    if (await User.findOne({ phone }))
      return res.status(400).json({ message: "Phone already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      fullName, email, country, phone,
      password: hashedPassword, agreedToTerms, isVerified: false,
    });

    // Create wallet with zero balance — signup bonus added only after email verification
    await Wallet.create({ user: newUser._id, balance: 0 });

    // Handle referral
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer && String(referrer._id) !== String(newUser._id)) {
        const { addReferral } = require("./ReferralController");
        await addReferral({ referrerId: referrer._id, refereeId: newUser._id });
      }
    }

    // Send verification email
    const token = crypto.randomBytes(32).toString("hex");
    await Token.create({ userId: newUser._id, token, type: "verify", expiresAt: new Date(Date.now() + 3600000) });
    const verifyUrl = `${process.env.BACKEND_URL}/api/auth/verify?token=${token}&id=${newUser._id}`;

    await sendEmail({
      email: newUser.email,
      subject: "Verify your MarineCash account",
      html: `<p>Hi ${newUser.fullName},</p><p>Verify your email: <a href="${verifyUrl}">Click here</a></p>`,
    });

    res.status(201).json({ message: "Verification email sent. Please check your inbox." });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token, id } = req.query;
    if (!token || !id)
      return res.redirect(`${process.env.FRONTEND_URL}/verify-email?status=error`);

    const tokenDoc = await Token.findOne({ userId: id, token, type: "verify", expiresAt: { $gt: new Date() } });
    if (!tokenDoc)
      return res.redirect(`${process.env.FRONTEND_URL}/verify-email?status=error`);

    const user = await User.findById(tokenDoc.userId);
    if (!user)
      return res.redirect(`${process.env.FRONTEND_URL}/verify-email?status=error`);

    user.isVerified = true;
    await user.save();
    await Token.deleteOne({ _id: tokenDoc._id });

    // Give signup bonus only if admin has configured it
    if (!user.signupBonusGiven) {
      const settings = await Settings.getSingleton();
      if (settings.signupBonus != null && settings.signupBonus > 0) {
        const wallet = await Wallet.findOne({ user: user._id });
        if (wallet) {
          wallet.balance += settings.signupBonus;
          await wallet.save();
          await WalletTransaction.create({
            user: user._id,
            type: "signup_bonus",
            amount: settings.signupBonus,
            fee: 0,
            netAmount: settings.signupBonus,
            status: "completed",
          });
        }
      }
      user.signupBonusGiven = true;
      await user.save();
    }

    await sendEmail({
      email: user.email,
      subject: "Welcome to MarineCash!",
      html: `<h2>Hi ${user.fullName},</h2><p>Your email is verified. Start earning today!</p>`,
    });

    res.redirect(`${process.env.FRONTEND_URL}/verify-email?status=success`);
  } catch (e) {
    res.redirect(`${process.env.FRONTEND_URL}/verify-email?status=error`);
  }
};

exports.resendVerification = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isVerified) return res.status(400).json({ message: "Already verified" });

    await Token.deleteMany({ userId: user._id, type: "verify" });
    const token = crypto.randomBytes(32).toString("hex");
    await Token.create({ userId: user._id, token, type: "verify", expiresAt: new Date(Date.now() + 3600000) });

    const verifyUrl = `${process.env.BACKEND_URL}/api/auth/verify?token=${token}&id=${user._id}`;
    await sendEmail({
      email: user.email,
      subject: "Resend Verification - MarineCash",
      html: `<p>Hi ${user.fullName},</p><p><a href="${verifyUrl}">Verify your email</a></p>`,
    });

    res.json({ message: "Verification email resent" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid email or password" });
    if (user.isBlocked) return res.status(403).json({ message: "Your account has been suspended." });
    if (!user.isVerified) return res.status(400).json({ message: "Please verify your email first" });

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
        country: user.country,
        phone: user.phone,
        role: user.role,
        badge: user.badge,
        referralCode: user.referralCode,
        referralLevel: user.referralLevel,
        hiddenSections: user.hiddenSections,
      },
      wallet: {
        balance: wallet?.balance || 0,
        earnedToday: wallet?.earnedToday || 0,
        totalWithdrawn: wallet?.totalWithdrawn || 0,
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(404).json({ message: "User not found" });

    await Token.deleteMany({ userId: user._id, type: "reset" });
    const token = crypto.randomBytes(32).toString("hex");
    await Token.create({ userId: user._id, token, type: "reset", expiresAt: new Date(Date.now() + 3600000) });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    await sendEmail({
      email: user.email,
      subject: "Reset your MarineCash password",
      html: `<p>Click below to reset your password:</p><a href="${resetUrl}">Reset Password</a>`,
    });

    res.json({ message: "Password reset email sent" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const tokenDoc = await Token.findOne({ token: req.params.token, type: "reset", expiresAt: { $gt: new Date() } });
    if (!tokenDoc) return res.status(400).json({ message: "Invalid or expired token" });

    const user = await User.findById(tokenDoc.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.password = await bcrypt.hash(req.body.password, 10);
    await user.save();
    await Token.deleteOne({ _id: tokenDoc._id });

    res.json({ message: "Password reset successfully" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    const wallet = await Wallet.findOne({ user: user._id });
    res.json({
      ...user.toObject(),
      wallet: {
        balance: wallet?.balance || 0,
        earnedToday: wallet?.earnedToday || 0,
        totalWithdrawn: wallet?.totalWithdrawn || 0,
        withdrawalHistory: wallet?.withdrawalHistory || [],
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
