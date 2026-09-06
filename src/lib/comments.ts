import { createServerFn } from "@tanstack/react-start";
import { db } from "./db";
import { requireAuth, getOptionalAuth } from "./auth-server";
import { checkRateLimit } from "./rate-limit";

export interface CommentNode {
  id: string;
  content: string;
  username: string;
  companyDomain: string;
  parentId: string | null;
  createdAt: string;
  voteScore: number;
  userVote: number;
  depth: number;
  isDeleted: boolean;
  replies: CommentNode[];
}

function buildCommentTree(flatComments: any[], user: any): CommentNode[] {
  const nodes: CommentNode[] = flatComments.map((c) => {
    // Calculate vote score using denormalized score (or aggregate fallback)
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

/**
 * Public read: fetch comments for a specific post.
 * Returns a nested tree structure paginated at the top level.
 */
export const getPostComments = createServerFn({ method: "GET" })
  .validator((data: any) => {
    if (typeof data === "string") {
      return { postId: data, page: 1, pageSize: 50 };
    }
    if (data && typeof data === "object" && "data" in data) {
      return { postId: data.data, page: 1, pageSize: 50 };
    }
    return {
      postId: data.postId,
      page: data.page || 1,
      pageSize: data.pageSize || 50,
    };
  })
  .handler(async ({ data: { postId, page = 1, pageSize = 50 } }) => {
    const user = await getOptionalAuth();
    
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

    // Paginate top-level (root) comments
    const start = (page - 1) * pageSize;
    const paginatedRoots = tree.slice(start, start + pageSize);

    return {
      comments: paginatedRoots,
      totalCount: tree.length,
      totalPages: Math.ceil(tree.length / pageSize),
    };
  });

/**
 * Secure write: create a comment (or comment reply). Resolves author ID server-side.
 */
export const createComment = createServerFn({ method: "POST" })
  .validator((data: { postId: string; content: string; parentId?: string }) => {
    if (!data.postId) throw new Error("Post ID is required");
    const content = data.content.trim();
    if (!content) throw new Error("Comment content cannot be empty");
    return { postId: data.postId, content, parentId: data.parentId };
  })
  .handler(async ({ data: { postId, content, parentId } }) => {
    const user = await requireAuth();

    if (!checkRateLimit(`user-${user.id}:create-comment`, 20, 3600000)) {
      throw new Error("Rate limit exceeded: You can only comment up to 20 times per hour.");
    }

    // Verify post exists
    const post = await db.post.findUnique({ where: { id: postId } });
    if (!post) throw new Error("Post not found");

    // If parentId exists, verify parent comment exists and resolve depth
    let depth = 0;
    if (parentId) {
      const parent = await db.comment.findUnique({ where: { id: parentId } });
      if (!parent) throw new Error("Parent comment not found");
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

    return { success: true, id: comment.id };
  });

/**
 * Secure write: vote on a comment (1 = upvote, -1 = downvote, 0 = clear).
 * Resolves voter ID server-side.
 */
export const voteComment = createServerFn({ method: "POST" })
  .validator((data: { commentId: string; value: number }) => {
    if (!data.commentId) throw new Error("Comment ID is required");
    if (data.value !== 1 && data.value !== -1 && data.value !== 0) {
      throw new Error("Invalid vote value");
    }
    return data;
  })
  .handler(async ({ data: { commentId, value } }) => {
    const user = await requireAuth();

    if (!checkRateLimit(`user-${user.id}:vote`, 60, 3600000)) {
      throw new Error("Rate limit exceeded: You can only vote up to 60 times per hour.");
    }

    await db.$transaction(async (tx) => {
      if (value === 0) {
        // Clear vote
        await tx.vote.deleteMany({
          where: {
            voterId: user.id,
            commentId,
          },
        });
      } else {
        // Create or update vote
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
    }, {
      timeout: 15000,
    });

    return { success: true };
  });
