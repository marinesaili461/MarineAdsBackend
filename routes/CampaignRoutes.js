import { Router } from "express";
import { protect } from "../Middlewares/authMiddleware.js";
import restrictTo from "../Middlewares/roleMiddleware.js";
import {
  createCampaign,
  fundAndActivate,
  pauseCampaign,
  resumeCampaign,
  stopCampaign,
  getMyCampaigns,
  listActive,
  getCampaign,
  submitProof,
  reviewSubmissionByPoster,
  adminListCampaigns,
  adminApproveCampaign,
  adminRejectCampaign,
  adminReviewSubmission,
  adminGetCampaign,
  uploadCampaignImage,
  multerUpload,
} from "../Controllers/CampaignController.js";

const router = Router();

// ── Admin (must be BEFORE /:id) ──────────────────────────
router.get("/admin/all", protect, restrictTo("admin", "superadmin"), adminListCampaigns);
router.get("/admin/:id", protect, restrictTo("admin", "superadmin"), adminGetCampaign);
router.put("/admin/:id/approve", protect, restrictTo("admin", "superadmin"), adminApproveCampaign);
router.put("/admin/:id/reject", protect, restrictTo("admin", "superadmin"), adminRejectCampaign);
router.put("/admin/:id/submissions/:submissionId/review", protect, restrictTo("admin", "superadmin"), adminReviewSubmission);

// ── Public / User ─────────────────────────────────────────
router.get("/", listActive);
router.get("/mine", protect, getMyCampaigns);
router.get("/:id", protect, getCampaign);
router.post("/", protect, createCampaign);
router.post("/upload-image", protect, multerUpload.single("image"), uploadCampaignImage);
router.put("/:id/fund-activate", protect, fundAndActivate);
router.put("/:id/pause", protect, pauseCampaign);
router.put("/:id/resume", protect, resumeCampaign);
router.put("/:id/stop", protect, stopCampaign);
router.post("/:id/submit", protect, submitProof);
router.put("/:id/submissions/:submissionId/review", protect, reviewSubmissionByPoster);

export default router;
