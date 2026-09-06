import { Router } from "express";
import {
  getChannels,
  getChannelBySlug,
  createChannel,
  joinChannel,
  leaveChannel,
} from "../controllers/channels.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", optionalAuth, getChannels);
router.get("/:slug", optionalAuth, getChannelBySlug);
router.post("/", requireAuth, createChannel);
router.post("/:id/join", requireAuth, joinChannel);
router.post("/:id/leave", requireAuth, leaveChannel);

export default router;
