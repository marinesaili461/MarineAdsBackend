import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    proofText: String,
    proofUrl: String,
    extraFields: { type: Object, default: {} },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "auto_approved", "disputed", "upheld", "overturned"],
      default: "pending",
    },
    rejectionReason: String,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date,
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ["survey", "video", "follow", "signup", "offer", "app_install", "other"],
      required: true,
    },
    payPerTask: { type: Number, required: true },
    platformFeePctAtCreate: { type: Number, required: true },
    maxEarners: { type: Number, required: true },
    perUserLimit: { type: Number, default: 1 },
    instructions: String,
    targetUrl: String,
    poster: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    escrowRequired: { type: Number, required: true },
    escrowLocked: { type: Number, default: 0 },
    feeAmount: { type: Number, required: true },
    payoutBudget: { type: Number, required: true },
    refundedAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["draft", "active", "paused", "completed", "exhausted", "stopped"],
      default: "draft",
      index: true,
    },
    completedCount: { type: Number, default: 0 },
    pendingCount: { type: Number, default: 0 },
    approvedCount: { type: Number, default: 0 },
    rejectedCount: { type: Number, default: 0 },
    submissions: [submissionSchema],
    approvalsCloseAt: Date,
    expiresAt: Date,
  },
  { timestamps: true }
);

campaignSchema.index({ status: 1, category: 1, createdAt: -1 });

campaignSchema.pre("save", function (next) {
  if (this.payoutBudget <= 0 && this.status === "active") {
    this.status = "exhausted";
  }
  next();
});

export default mongoose.model("Campaign", campaignSchema);
