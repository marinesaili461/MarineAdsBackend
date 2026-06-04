import { Router } from "express";
import { protect } from "../Middlewares/authMiddleware.js";
import role from "../Middlewares/roleMiddleware.js";
import * as D from "../Controllers/AdminDisputeController.js";

const router = Router();

router.post("/campaigns/:id/submissions/:submissionId/dispute", protect, role("admin"), D.reviewDispute);

export default router;
