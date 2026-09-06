import { Router } from "express";
import authRoutes from "./auth.routes.js";
import channelsRoutes from "./channels.routes.js";
import postsRoutes from "./posts.routes.js";
import commentsRoutes from "./comments.routes.js";
import reportsRoutes from "./reports.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/channels", channelsRoutes);
router.use("/posts", postsRoutes);
router.use("/comments", commentsRoutes);
router.use("/reports", reportsRoutes);

export default router;
