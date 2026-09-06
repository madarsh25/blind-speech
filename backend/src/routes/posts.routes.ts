import { Router } from "express";
import {
  getPosts,
  getPostById,
  createPost,
  getPostsByHashtag,
  getTrendingHashtags,
  votePost,
} from "../controllers/posts.controller.js";
import {
  getPostComments,
  createComment,
} from "../controllers/comments.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", optionalAuth, getPosts);
router.get("/trending/hashtags", getTrendingHashtags);
router.get("/hashtag/:tag", optionalAuth, getPostsByHashtag);
router.get("/:id", optionalAuth, getPostById);
router.post("/", requireAuth, createPost);
router.post("/:id/vote", requireAuth, votePost);

// Nested comments routes on posts
router.get("/:postId/comments", optionalAuth, getPostComments);
router.post("/:postId/comments", requireAuth, createComment);

export default router;
