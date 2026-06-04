import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    balance: { type: Number, default: 0 },
    locked: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    earnedToday: { type: Number, default: 0 },
    totalDeposited: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    withdrawalHistory: [
      {
        amount: { type: Number, required: true },
        date: { type: Date, default: Date.now },
        status: { type: String, default: "pending" },
      },
    ],
    lastWithdrawalDate: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Wallet", walletSchema);
