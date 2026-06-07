import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

// Routes
import authRoutes from "./routes/AuthRoutes.js";
import userRoutes from "./routes/UserRoutes.js";
import walletRoutes from "./routes/WalletRoutes.js";
import taskRoutes from "./routes/TaskRoutes.js";
import taskSubmissionRoutes from "./routes/TaskSubmissionRoutes.js";
import campaignRoutes from "./routes/CampaignRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import moderatorRoutes from "./routes/ModeratorRoutes.js";
import rewardCodeRoutes from "./routes/RewardCodeRoutes.js";
import referralRoutes from "./routes/ReferralRoutes.js";
import chatRoutes from "./routes/ChatRoutes.js";
import disputeRoutes from "./routes/AdminDisputeRoutes.js";
import faqRoutes from "./routes/FAQRoutes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_ORIGINS = [
  "https://mainecash.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.log("🚫 Blocked by CORS:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
};

const app = express();

app.set("trust proxy", 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // allow images to load from frontend
}));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "10mb" })); // reduced — no more base64 image blobs
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(morgan("dev"));
app.use(cookieParser());

// Serve uploaded campaign images statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.json({ status: "MarineCash backend running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/task-submissions", taskSubmissionRoutes);
app.use("/api/campaign", campaignRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/moderator", moderatorRoutes);
app.use("/api/rewardcode", rewardCodeRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin/disputes", disputeRoutes);
app.use("/api/faq", faqRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || "Server Error" });
});

export default app;
