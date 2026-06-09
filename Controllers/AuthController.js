import User from "../models/User.js";
import Token from "../models/Token.js";
import Wallet from "../models/Wallet.js";
import WalletTransaction from "../models/WalletTransaction.js";
import Settings from "../models/Settings.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import sendEmail from "../Utils/SendEmail.js";
import { addReferral } from "./ReferralController.js";

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

export const register = async (req, res) => {
  try {
    const {
      fullName, email, gender, phone, phoneCountry,
      password, confirmPassword, agreedToTerms, referralCode,
    } = req.body;

    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match" });

    if (await User.findOne({ email }))
      return res.status(400).json({ message: "Email already registered" });

    if (await User.findOne({ phone }))
      return res.status(400).json({ message: "Phone already registered" });

    // ── IP country detection ──────────────────────────────────────
    let ipCountry = "Unknown";
    try {
      const ip =
        (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
        req.socket?.remoteAddress ||
        "";
      // Skip private/loopback IPs (local dev)
      const isPrivate = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
      if (!isPrivate && ip) {
        const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=country`);
        const geoData = await geoRes.json();
        if (geoData?.country) ipCountry = geoData.country;
      }
    } catch {
      // geo lookup failed — non-blocking
    }

    // ── Soft flag: compare IP country vs phone dial code country ──
    const countryMismatch =
      phoneCountry &&
      ipCountry !== "Unknown" &&
      phoneCountry.toLowerCase() !== ipCountry.toLowerCase();

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      fullName,
      email,
      gender,
      phone,
      phoneCountry: phoneCountry || null,
      country: ipCountry,
      countryMismatch: !!countryMismatch,
      password: hashedPassword,
      agreedToTerms,
      isVerified: false,
    });

    await Wallet.create({ user: newUser._id, balance: 0 });

    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer && String(referrer._id) !== String(newUser._id)) {
        await addReferral({ referrerId: referrer._id, refereeId: newUser._id });
      }
    }

    const token = crypto.randomBytes(32).toString("hex");
    await Token.create({ userId: newUser._id, token, type: "verify", expiresAt: new Date(Date.now() + 3600000) });
    const verifyUrl = `${process.env.BACKEND_URL}/api/auth/verify?token=${token}&id=${newUser._id}`;

    await sendEmail({
      email: newUser.email,
      subject: "Verify your MarineCash account",
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0369a1 100%);padding:40px 32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;letter-spacing:-0.5px;">🌊 MarineCash</h1>
            <p style="color:#bae6fd;margin:8px 0 0;font-size:14px;">Earn. Grow. Thrive.</p>
          </div>
          <div style="padding:40px 32px;">
            <h2 style="color:#0f172a;font-size:22px;margin:0 0 12px;">Welcome, ${newUser.fullName}! 👋</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 28px;">Thanks for signing up. One last step — verify your email address to activate your account and start earning.</p>
            <div style="text-align:center;margin:0 0 32px;">
              <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#0369a1);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">✅ Verify My Email</a>
            </div>
            <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;">This link expires in <strong>1 hour</strong>. If you didn't create an account, you can safely ignore this email.</p>
          </div>
          <div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">© ${new Date().getFullYear()} MarineCash. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    res.status(201).json({ message: "Verification email sent. Please check your inbox." });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const verifyEmail = async (req, res) => {
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
      subject: "🎉 You're verified — Welcome to MarineCash!",
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0369a1 100%);padding:40px 32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">🌊 MarineCash</h1>
            <p style="color:#bae6fd;margin:8px 0 0;font-size:14px;">Earn. Grow. Thrive.</p>
          </div>
          <div style="padding:40px 32px;text-align:center;">
            <div style="font-size:56px;margin-bottom:16px;">🎉</div>
            <h2 style="color:#0f172a;font-size:24px;margin:0 0 12px;">You're all set, ${user.fullName}!</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 28px;">Your email has been verified. Your account is now active — time to start earning!</p>
            <a href="${process.env.FRONTEND_URL}/dashboard" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#0369a1);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;">🚀 Go to Dashboard</a>
          </div>
          <div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">© ${new Date().getFullYear()} MarineCash. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    res.redirect(`${process.env.FRONTEND_URL}/verify-email?status=success`);
  } catch (e) {
    res.redirect(`${process.env.FRONTEND_URL}/verify-email?status=error`);
  }
};

export const resendVerification = async (req, res) => {
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
      subject: "Resend: Verify your MarineCash account",
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0369a1 100%);padding:40px 32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">🌊 MarineCash</h1>
            <p style="color:#bae6fd;margin:8px 0 0;font-size:14px;">Earn. Grow. Thrive.</p>
          </div>
          <div style="padding:40px 32px;">
            <h2 style="color:#0f172a;font-size:22px;margin:0 0 12px;">Hi ${user.fullName},</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 28px;">Here's your new verification link. Click the button below to verify your email and activate your account.</p>
            <div style="text-align:center;margin:0 0 32px;">
              <a href="${verifyUrl}" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#0369a1);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;">✅ Verify My Email</a>
            </div>
            <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;">This link expires in <strong>1 hour</strong>.</p>
          </div>
          <div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">© ${new Date().getFullYear()} MarineCash. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    res.json({ message: "Verification email resent" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const login = async (req, res) => {
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

export const forgotPassword = async (req, res) => {
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
      html: `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <div style="background:linear-gradient(135deg,#0ea5e9 0%,#0369a1 100%);padding:40px 32px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">🌊 MarineCash</h1>
            <p style="color:#bae6fd;margin:8px 0 0;font-size:14px;">Earn. Grow. Thrive.</p>
          </div>
          <div style="padding:40px 32px;">
            <h2 style="color:#0f172a;font-size:22px;margin:0 0 12px;">Password Reset Request</h2>
            <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 28px;">Hi ${user.fullName}, we received a request to reset your password. Click the button below to set a new one.</p>
            <div style="text-align:center;margin:0 0 32px;">
              <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;">🔑 Reset Password</a>
            </div>
            <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;">This link expires in <strong>1 hour</strong>. If you didn't request this, ignore this email — your password won't change.</p>
          </div>
          <div style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">© ${new Date().getFullYear()} MarineCash. All rights reserved.</p>
          </div>
        </div>
      `,
    });

    res.json({ message: "Password reset email sent" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const resetPassword = async (req, res) => {
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

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password");
      .populate("badge", "name imageUrl hidden");
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
