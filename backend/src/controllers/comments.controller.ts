import { Request, Response } from "express";
import { db } from "../lib/db.js";
import { checkRateLimit } from "../lib/rate-limit.js";
import { CommentNode } from "@blind-speech/shared";

function buildCommentTree(flatComments: any[], user: any): CommentNode[] {
  const nodes: CommentNode[] = flatComments.map((c) => {
    let userVote = 0;
    if (user) {
      const found = c.votes.find((v: any) => v.voterId === user.id);
      if (found) userVote = found.value;
    }

    return {
      id: c.id,
      content: c.isDeleted ? "[deleted]" : c.content,
      username: c.isDeleted ? "[deleted]" : c.author.username,
      companyDomain: c.isDeleted ? "" : c.author.companyDomain,
      parentId: c.parentId,
      createdAt: c.createdAt.toISOString(),
      voteScore: c.score,
      userVote,
      depth: c.depth,
      isDeleted: c.isDeleted,
      replies: [],
    };
  });

  const nodeMap = new Map<string, CommentNode>(nodes.map((n) => [n.id, n]));
  const roots: CommentNode[] = [];

  for (const node of nodes) {
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        parent.replies.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export async function getPostComments(req: Request, res: Response) {
  try {
    const postId = req.params.postId;
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 50;
    const user = req.user;

    if (!postId) {
      return res.status(400).json({ success: false, error: "Post ID is required" });
    }

    const comments = await db.comment.findMany({
      where: { postId },
      include: {
        author: {
          select: { username: true, companyDomain: true },
        },
        votes: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const tree = buildCommentTree(comments, user);

    const start = (page - 1) * pageSize;
    const paginatedRoots = tree.slice(start, start + pageSize);

    return res.json({
      success: true,
      data: {
        comments: paginatedRoots,
        totalCount: tree.length,
        totalPages: Math.ceil(tree.length / pageSize),
      },
    });
  } catch (e: any) {
    console.error("getPostComments error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to fetch comments" });
  }
}

export async function createComment(req: Request, res: Response) {
  try {
    const user = req.user!;
    const postId = req.params.postId;
    const { content: rawContent, parentId } = req.body;

    if (!postId) {
      return res.status(400).json({ success: false, error: "Post ID is required" });
    }

    const content = (rawContent || "").trim();
    if (!content) {
      return res.status(400).json({ success: false, error: "Comment content cannot be empty" });
    }

    if (!checkRateLimit(`user-${user.id}:create-comment`, 20, 3600000)) {
      return res.status(429).json({ success: false, error: "Rate limit exceeded: You can only comment up to 20 times per hour." });
    }

    const post = await db.post.findUnique({ where: { id: postId } });
    if (!post) {
      return res.status(404).json({ success: false, error: "Post not found" });
    }

    let depth = 0;
    if (parentId) {
      const parent = await db.comment.findUnique({ where: { id: parentId } });
      if (!parent) {
        return res.status(404).json({ success: false, error: "Parent comment not found" });
      }
      depth = parent.depth + 1;
    }

    const comment = await db.comment.create({
      data: {
        content,
        postId,
        authorId: user.id,
        parentId: parentId || null,
        depth,
      },
    });

    return res.json({ success: true, data: { id: comment.id } });
  } catch (e: any) {
    console.error("createComment error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to create comment" });
  }
}

export async function voteComment(req: Request, res: Response) {
  try {
    const user = req.user!;
    const commentId = req.params.id;
    const { value } = req.body;

    if (!commentId) {
      return res.status(400).json({ success: false, error: "Comment ID is required" });
    }
    if (value !== 1 && value !== -1 && value !== 0) {
      return res.status(400).json({ success: false, error: "Invalid vote value" });
    }

    if (!checkRateLimit(`user-${user.id}:vote`, 60, 3600000)) {
      return res.status(429).json({ success: false, error: "Rate limit exceeded: You can only vote up to 60 times per hour." });
    }

    await db.$transaction(async (tx) => {
      if (value === 0) {
        await tx.vote.deleteMany({
          where: {
            voterId: user.id,
            commentId,
          },
        });
      } else {
        await tx.vote.upsert({
          where: {
            voterId_commentId: {
              voterId: user.id,
              commentId,
            },
          },
          create: {
            voterId: user.id,
            commentId,
            value,
          },
          update: {
            value,
          },
        });
      }

      // Recalculate denormalized score on Comment
      const agg = await tx.vote.aggregate({
        _sum: { value: true },
        where: { commentId },
      });
      const newScore = agg._sum.value || 0;

      await tx.comment.update({
        where: { id: commentId },
        data: { score: newScore },
      });
    }, { timeout: 15000 });

    return res.json({ success: true });
  } catch (e: any) {
    console.error("voteComment error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to vote on comment" });
  }
}
