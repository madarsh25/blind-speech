import { Router } from "express";
import {
  reportContent,
  getReportsByChannel,
  moderateContent,
} from "../controllers/reports.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", requireAuth, reportContent);
router.get("/channel/:channelId", requireAuth, getReportsByChannel);
router.post("/:id/moderate", requireAuth, moderateContent);

export default router;
