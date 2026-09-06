import { createServerFn } from "@tanstack/react-start";
import { db } from "./db";
import { requireAuth, getOptionalAuth } from "./auth-server";
import { checkRateLimit } from "./rate-limit";

function calculateHotScore(score: number, createdAt: Date): number {
  const order = Math.log10(Math.max(1, Math.abs(score)));
  const sign = score > 0 ? 1 : (score < 0 ? -1 : 0);
  // Epoch: Jan 1, 2026 (1767225600 seconds)
  const seconds = (createdAt.getTime() / 1000) - 1767225600;
  return order * sign + seconds / 45000;
}

/**
 * Public read: fetch posts with sorting and channel scoping.
 * If no channelId is specified and the user is authenticated,
 * it scopes the feed to channels they have joined (Home Feed).
 */
export const getPosts = createServerFn({ method: "GET" })
  .validator((data: { channelId?: string; sort?: "new" | "top" | "hot"; searchQuery?: string } = {}) => data)
  .handler(async ({ data: { channelId, sort = "new", searchQuery } }) => {
    const user = await getOptionalAuth();

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

    // Fetch posts with author and channel info (no need to fetch all votes of other users)
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

    // Efficiently fetch votes of the current user for the retrieved posts
    const postIds = posts.map((p) => p.id);
    const userVotes = user && postIds.length > 0 ? await db.vote.findMany({
      where: { voterId: user.id, postId: { in: postIds } },
      select: { postId: true, value: true },
    }) : [];
    const userVotesMap = new Map(userVotes.map((v) => [v.postId, v.value]));

    // Map database result and compute hot rank
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

    // If hot sorting is requested, sort the mapped array in JS
    if (sort === "hot") {
      mapped.sort((a, b) => b.hotScore - a.hotScore);
    }

    return mapped;
  });

/**
 * Secure write: create a new post in a channel. Resolves author ID server-side.
 */
export const createPost = createServerFn({ method: "POST" })
  .validator((data: { channelId: string; title: string; content: string; tags?: string[] }) => {
    if (!data.channelId) throw new Error("A channel is required");
    const title = data.title.trim();
    const content = data.content.trim();
    if (title.length < 5 || title.length > 100) {
      throw new Error("Title must be between 5 and 100 characters");
    }
    if (content.length < 10) {
      throw new Error("Post content must be at least 10 characters");
    }
    return { channelId: data.channelId, title, content, tags: data.tags };
  })
  .handler(async ({ data: { channelId, title, content, tags } }) => {
    const user = await requireAuth();

    if (!checkRateLimit(`user-${user.id}:create-post`, 5, 3600000)) {
      throw new Error("Rate limit exceeded: You can only create up to 5 posts per hour.");
    }

    // Verify channel exists
    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new Error("Target channel not found");

    // Parse hashtags using regex (alphanumeric + underscore only, normalize to lowercase)
    const parsedTags = (content.match(/#[a-zA-Z0-9_]+/g) || [])
      .map((t) => t.slice(1).toLowerCase());

    // Merge manual and parsed tags, deduplicate
    const normalizedManual = (tags || []).map((t) => t.toLowerCase().trim().replace(/^#/, ""));
    const allTags = Array.from(new Set([...parsedTags, ...normalizedManual])).filter(Boolean);

    // Validation: Cap total hashtags at 5
    if (allTags.length > 5) {
      throw new Error("Validation error: A post can have at most 5 hashtags.");
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
    }, {
      timeout: 15000,
    });

    return { success: true, id: post.id };
  });

/**
 * Public read: fetch posts associated with a hashtag.
 */
export const getPostsByHashtag = createServerFn({ method: "GET" })
  .validator((data: { tag: string; sort?: "new" | "top" | "hot" }) => {
    if (!data.tag) throw new Error("Tag is required");
    return data;
  })
  .handler(async ({ data: { tag, sort = "new" } }) => {
    const user = await getOptionalAuth();
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

    return mapped;
  });

/**
 * Public read: fetch trending hashtags in the last 48 hours.
 */
export const getTrendingHashtags = createServerFn({ method: "GET" })
  .validator((limit: number = 5) => limit)
  .handler(async ({ data: limit }) => {
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

    return result.map((r) => ({
      tag: r.tag,
      postCount: r.post_count,
    }));
  });

/**
 * Secure write: vote on a post (1 = upvote, -1 = downvote, 0 = clear).
 * Resolves voter ID server-side.
 */
export const votePost = createServerFn({ method: "POST" })
  .validator((data: { postId: string; value: number }) => {
    if (!data.postId) throw new Error("Post ID is required");
    if (data.value !== 1 && data.value !== -1 && data.value !== 0) {
      throw new Error("Invalid vote value");
    }
    return data;
  })
  .handler(async ({ data: { postId, value } }) => {
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
            postId,
          },
        });
      } else {
        // Create or update vote
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
    }, {
      timeout: 15000,
    });

    return { success: true };
  });
