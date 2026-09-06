import { Router } from "express";
import { voteComment } from "../controllers/comments.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/:id/vote", requireAuth, voteComment);

export default router;
