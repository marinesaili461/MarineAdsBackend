import { Router } from "express";
import { protect } from "../Middlewares/authMiddleware.js";
import { isAdmin } from "../Middlewares/adminMiddleware.js";
import {
  getWallet, deposit, getTransactions,
  getAllDeposits, approveDeposit, rejectDeposit,
} from "../Controllers/WalletController.js";

const router = Router();

router.get("/", protect, getWallet);
router.post("/deposit", protect, deposit);
router.get("/transactions", protect, getTransactions);

// admin
router.get("/admin/deposits",        protect, isAdmin, getAllDeposits);
router.put("/admin/deposits/:id/approve", protect, isAdmin, approveDeposit);
router.put("/admin/deposits/:id/reject",  protect, isAdmin, rejectDeposit);

export default router;
