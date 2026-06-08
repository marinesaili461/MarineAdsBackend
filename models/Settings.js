import mongoose from "mongoose";

const badgeTierSchema = new mongoose.Schema(
  { name: { type: String, required: true }, minReferrals: { type: Number, required: true }, badgeImage: { type: String }, color: { type: String } },
  { _id: true }
);

const announcementSchema = new mongoose.Schema(
  { text: { type: String, required: true }, isActive: { type: Boolean, default: true }, createdAt: { type: Date, default: Date.now } },
  { _id: true }
);

const pollOptionSchema = new mongoose.Schema(
  { text: { type: String, required: true }, votes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }] },
  { _id: true }
);

const pollSchema = new mongoose.Schema(
  { question: { type: String, required: true }, options: [pollOptionSchema], isActive: { type: Boolean, default: true }, expiresAt: { type: Date }, createdAt: { type: Date, default: Date.now } },
  { _id: true }
);

const settingsSchema = new mongoose.Schema(
  {
    platformFeePct: { type: Number },
    campaignFeePct: { type: Number },         // ← fee cut on campaign funding
    offerwallFeePct: { type: Number },
    withdrawalFeePct: { type: Number },
    minWithdrawal: { type: Number },
    withdrawalDays: { type: Number },
    signupBonus: { type: Number },
    dailyCheckInEnabled: { type: Boolean },
    dailyCheckInAmount: { type: Number },
    referralCommissionPct: { type: Number },
    referralSystemCutPct: { type: Number },
    referralTasksToActivate: { type: Number },
    badgeTiers: { type: [badgeTierSchema], default: [] },
    autoApproveDays: { type: Number, default: 3 },
    minPayGlobal: { type: Number },
    categoryMinimums: { type: Map, of: Number, default: {} },
    announcements: { type: [announcementSchema], default: [] },
    polls: { type: [pollSchema], default: [] },
    maintenanceMode: { type: Boolean },
    maintenanceMessage: { type: String },
    showTopEarners: { type: Boolean, default: true },
  },
  { timestamps: true }
);

settingsSchema.statics.getSingleton = async function () {
  let s = await this.findOne();
  if (!s) s = await this.create({});
  return s;
};

export default mongoose.model("Settings", settingsSchema);
