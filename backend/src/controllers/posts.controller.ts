import { Request, Response } from "express";
import { db } from "../lib/db.js";
import { checkRateLimit } from "../lib/rate-limit.js";

function calculateHotScore(score: number, createdAt: Date): number {
  const order = Math.log10(Math.max(1, Math.abs(score)));
  const sign = score > 0 ? 1 : (score < 0 ? -1 : 0);
  // Epoch: Jan 1, 2026 (1767225600 seconds)
  const seconds = (createdAt.getTime() / 1000) - 1767225600;
  return order * sign + seconds / 45000;
}

export async function getPosts(req: Request, res: Response) {
  try {
    const user = req.user;
    const channelId = req.query.channelId as string | undefined;
    const sort = (req.query.sort as "new" | "top" | "hot") || "new";
    const searchQuery = req.query.searchQuery as string | undefined;

    let whereClause: any = {
      isDeleted: false,
    };

    if (channelId) {
      whereClause.channelId = channelId;
    } else if (user) {
      // Home Feed: only show posts from joined channels
      const joinedMemberships = await db.channelMembership.findMany({
        where: { userId: user.id },
        select: { channelId: true },
      });
      const joinedChannelIds = joinedMemberships.map((m) => m.channelId);
      
      if (joinedChannelIds.length > 0) {
        whereClause.channelId = { in: joinedChannelIds };
      }
    }

    if (searchQuery) {
      const cleanSearch = searchQuery.trim();
      if (cleanSearch) {
        whereClause.OR = [
          { title: { contains: cleanSearch, mode: "insensitive" } },
          { content: { contains: cleanSearch, mode: "insensitive" } },
        ];
      }
    }

    const posts = await db.post.findMany({
      where: whereClause,
      include: {
        author: {
          select: { username: true, companyDomain: true },
        },
        channel: {
          select: { id: true, name: true },
        },
        _count: {
          select: { comments: true },
        },
      },
      orderBy: sort === "new" ? { createdAt: "desc" } : (sort === "top" ? { score: "desc" } : undefined),
    });

    const postIds = posts.map((p) => p.id);
    const userVotes = user && postIds.length > 0 ? await db.vote.findMany({
      where: { voterId: user.id, postId: { in: postIds } },
      select: { postId: true, value: true },
    }) : [];
    const userVotesMap = new Map(userVotes.map((v) => [v.postId, v.value]));

    const mapped = posts.map((p) => {
      const userVote = userVotesMap.get(p.id) || 0;
      const hotScore = calculateHotScore(p.score, p.createdAt);

      return {
        id: p.id,
        title: p.title,
        content: p.content,
        username: p.author.username,
        companyDomain: p.author.companyDomain,
        channelName: p.channel.name,
        channelId: p.channel.id,
        createdAt: p.createdAt.toISOString(),
        commentCount: p._count.comments,
        voteScore: p.score,
        userVote,
        hotScore,
      };
    });

    if (sort === "hot") {
      mapped.sort((a, b) => b.hotScore - a.hotScore);
    }

    return res.json({ success: true, data: mapped });
  } catch (e: any) {
    console.error("getPosts error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to fetch posts" });
  }
}

export async function getPostById(req: Request, res: Response) {
  try {
    const id = req.params.id;
    const user = req.user;

    const post = await db.post.findUnique({
      where: { id },
      include: {
        author: { select: { username: true, companyDomain: true } },
        channel: { select: { id: true, name: true } },
        votes: true,
      },
    });

    if (!post) {
      return res.status(404).json({ success: false, error: "Post not found" });
    }

    const upvotes = post.votes.filter((v) => v.value === 1).length;
    const downvotes = post.votes.filter((v) => v.value === -1).length;
    const voteScore = upvotes - downvotes;

    let userVote = 0;
    if (user) {
      const found = post.votes.find((v) => v.voterId === user.id);
      if (found) userVote = found.value;
    }

    const data = {
      id: post.id,
      title: post.title,
      content: post.content,
      username: post.author.username,
      companyDomain: post.author.companyDomain,
      channelName: post.channel.name,
      channelId: post.channel.id,
      createdAt: post.createdAt.toISOString(),
      voteScore,
      userVote,
    };

    return res.json({ success: true, data });
  } catch (e: any) {
    console.error("getPostById error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to fetch post" });
  }
}

export async function createPost(req: Request, res: Response) {
  try {
    const user = req.user!;
    const { channelId, title: rawTitle, content: rawContent, tags } = req.body;

    if (!channelId) {
      return res.status(400).json({ success: false, error: "A channel is required" });
    }

    const title = (rawTitle || "").trim();
    const content = (rawContent || "").trim();

    if (title.length < 5 || title.length > 100) {
      return res.status(400).json({ success: false, error: "Title must be between 5 and 100 characters" });
    }
    if (content.length < 10) {
      return res.status(400).json({ success: false, error: "Post content must be at least 10 characters" });
    }

    if (!checkRateLimit(`user-${user.id}:create-post`, 5, 3600000)) {
      return res.status(429).json({ success: false, error: "Rate limit exceeded: You can only create up to 5 posts per hour." });
    }

    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return res.status(404).json({ success: false, error: "Target channel not found" });
    }

    // Parse hashtags
    const parsedTags = (content.match(/#[a-zA-Z0-9_]+/g) || [])
      .map((t: string) => t.slice(1).toLowerCase());

    const normalizedManual = (tags || []).map((t: string) => t.toLowerCase().trim().replace(/^#/, ""));
    const allTags = Array.from(new Set([...parsedTags, ...normalizedManual])).filter(Boolean);

    if (allTags.length > 5) {
      return res.status(400).json({ success: false, error: "Validation error: A post can have at most 5 hashtags." });
    }

    const post = await db.$transaction(async (tx) => {
      const p = await tx.post.create({
        data: {
          title,
          content,
          channelId,
          authorId: user.id,
        },
      });

      for (const tag of allTags) {
        const hashtag = await tx.hashtag.upsert({
          where: { tag },
          create: { tag },
          update: {},
        });

        await tx.postHashtag.create({
          data: {
            postId: p.id,
            hashtagId: hashtag.id,
          },
        });
      }

      return p;
    }, { timeout: 15000 });

    return res.json({ success: true, data: { id: post.id } });
  } catch (e: any) {
    console.error("createPost error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to create post" });
  }
}

export async function getPostsByHashtag(req: Request, res: Response) {
  try {
    const user = req.user;
    const tag = req.params.tag;
    const sort = (req.query.sort as "new" | "top" | "hot") || "new";

    if (!tag) {
      return res.status(400).json({ success: false, error: "Tag is required" });
    }

    const cleanTag = tag.toLowerCase().trim().replace(/^#/, "");

    const posts = await db.post.findMany({
      where: {
        isDeleted: false,
        hashtags: {
          some: {
            hashtag: { tag: cleanTag },
          },
        },
      },
      include: {
        author: {
          select: { username: true, companyDomain: true },
        },
        channel: {
          select: { id: true, name: true },
        },
        _count: {
          select: { comments: true },
        },
      },
      orderBy: sort === "new" ? { createdAt: "desc" } : (sort === "top" ? { score: "desc" } : undefined),
    });

    const postIds = posts.map((p) => p.id);
    const userVotes = user && postIds.length > 0 ? await db.vote.findMany({
      where: { voterId: user.id, postId: { in: postIds } },
      select: { postId: true, value: true },
    }) : [];
    const userVotesMap = new Map(userVotes.map((v) => [v.postId, v.value]));

    const mapped = posts.map((p) => {
      const userVote = userVotesMap.get(p.id) || 0;
      const hotScore = calculateHotScore(p.score, p.createdAt);

      return {
        id: p.id,
        title: p.title,
        content: p.content,
        username: p.author.username,
        companyDomain: p.author.companyDomain,
        channelName: p.channel.name,
        channelId: p.channel.id,
        createdAt: p.createdAt.toISOString(),
        commentCount: p._count.comments,
        voteScore: p.score,
        userVote,
        hotScore,
      };
    });

    if (sort === "hot") {
      mapped.sort((a, b) => b.hotScore - a.hotScore);
    }

    return res.json({ success: true, data: mapped });
  } catch (e: any) {
    console.error("getPostsByHashtag error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to fetch posts by hashtag" });
  }
}

export async function getTrendingHashtags(req: Request, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 5;
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const result = await db.$queryRaw<Array<{ tag: string; post_count: number }>>`
      SELECT h.tag, COUNT(ph.post_id)::int as post_count
      FROM tweeting.tweeting_hashtags h
      JOIN tweeting.tweeting_post_hashtags ph ON h.id = ph.hashtag_id
      JOIN tweeting.tweeting_posts p ON ph.post_id = p.id
      WHERE p.created_at >= ${fortyEightHoursAgo}
      GROUP BY h.tag
      ORDER BY post_count DESC
      LIMIT ${limit}
    `;

    const data = result.map((r) => ({
      tag: r.tag,
      postCount: r.post_count,
    }));

    return res.json({ success: true, data });
  } catch (e: any) {
    console.error("getTrendingHashtags error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to fetch trending hashtags" });
  }
}

export async function votePost(req: Request, res: Response) {
  try {
    const user = req.user!;
    const postId = req.params.id;
    const { value } = req.body;

    if (!postId) {
      return res.status(400).json({ success: false, error: "Post ID is required" });
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
            postId,
          },
        });
      } else {
        await tx.vote.upsert({
          where: {
            voterId_postId: {
              voterId: user.id,
              postId,
            },
          },
          create: {
            voterId: user.id,
            postId,
            value,
          },
          update: {
            value,
          },
        });
      }

      // Recalculate denormalized score on Post
      const agg = await tx.vote.aggregate({
        _sum: { value: true },
        where: { postId },
      });
      const newScore = agg._sum.value || 0;

      await tx.post.update({
        where: { id: postId },
        data: { score: newScore },
      });
    }, { timeout: 15000 });

    return res.json({ success: true });
  } catch (e: any) {
    console.error("votePost error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to vote on post" });
  }
}
