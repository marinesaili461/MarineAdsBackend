import mongoose from "mongoose";

const ticketCategorySchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    isVisible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("TicketCategory", ticketCategorySchema);
