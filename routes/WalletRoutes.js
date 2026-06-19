import { Router } from "express";
import { protect } from "../Middlewares/authMiddleware.js";
import {
  getWallet, deposit, getTransactions,
  getAllDeposits, approveDeposit, rejectDeposit,
} from "../Controllers/WalletController.js";

const router = Router();

router.get("/", protect, getWallet);
router.post("/deposit", protect, deposit);
router.get("/transactions", protect, getTransactions);

// admin
router.get("/admin/deposits",        protect,getAllDeposits);
router.put("/admin/deposits/:id/approve", protect, approveDeposit);
router.put("/admin/deposits/:id/reject",  protect,rejectDeposit);

export default router;
