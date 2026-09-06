import { createServerFn } from "@tanstack/react-start";
import { db } from "./db";
import { requireAuth, getOptionalAuth } from "./auth-server";
import { checkRateLimit } from "./rate-limit";

/**
 * Public read: fetch all channels.
 */
export const getChannels = createServerFn({ method: "GET" })
  .handler(async () => {
    const user = await getOptionalAuth();
    const channels = await db.channel.findMany({
      include: {
        _count: {
          select: { posts: true, memberships: true },
        },
        memberships: user ? { where: { userId: user.id } } : false,
      },
      orderBy: { name: "asc" },
    });

    return channels.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      postCount: c._count.posts,
      memberCount: c._count.memberships,
      isMember: user ? c.memberships.length > 0 : false,
    }));
  });

/**
 * Public read: fetch a single channel by its unique name/slug.
 */
export const getChannelBySlug = createServerFn({ method: "GET" })
  .validator((name: string) => name.toLowerCase().trim())
  .handler(async ({ data: name }) => {
    const user = await getOptionalAuth();
    const channel = await db.channel.findUnique({
      where: { name },
      include: {
        _count: {
          select: { posts: true, memberships: true },
        },
        memberships: user ? { where: { userId: user.id } } : false,
      },
    });

    if (!channel) {
      throw new Error("Channel not found");
    }

    return {
      id: channel.id,
      name: channel.name,
      description: channel.description,
      postCount: channel._count.posts,
      memberCount: channel._count.memberships,
      isMember: user ? channel.memberships.length > 0 : false,
    };
  });

/**
 * Secure write: create a new channel. Resolves creator ID server-side.
 */
export const createChannel = createServerFn({ method: "POST" })
  .validator((data: { name: string; description: string }) => {
    const name = data.name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
    if (name.length < 3 || name.length > 25) {
      throw new Error("Channel name must be between 3 and 25 alphanumeric characters");
    }
    return { name, description: data.description.trim() };
  })
  .handler(async ({ data: { name, description } }) => {
    const user = await requireAuth();

    if (!checkRateLimit(`user-${user.id}:create-channel`, 5, 3600000)) {
      throw new Error("Rate limit exceeded: You can only create up to 5 channels per hour.");
    }

    const existing = await db.channel.findUnique({ where: { name } });
    if (existing) {
      throw new Error(`Channel #${name} already exists`);
    }

    const channel = await db.channel.create({
      data: {
        name,
        description,
        createdById: user.id,
      },
    });

    // Auto-join the creator to their channel
    await db.channelMembership.create({
      data: {
        userId: user.id,
        channelId: channel.id,
      },
    });

    return { success: true, name: channel.name };
  });

/**
 * Secure write: join a channel. Resolves user ID server-side.
 */
export const joinChannel = createServerFn({ method: "POST" })
  .validator((channelId: string) => channelId)
  .handler(async ({ data: channelId }) => {
    const user = await requireAuth();

    if (!checkRateLimit(`user-${user.id}:join-channel`, 30, 3600000)) {
      throw new Error("Rate limit exceeded: You can only join up to 30 channels per hour.");
    }

    await db.channelMembership.upsert({
      where: {
        userId_channelId: {
          userId: user.id,
          channelId,
        },
      },
      create: {
        userId: user.id,
        channelId,
      },
      update: {},
    });
    return { success: true };
  });

/**
 * Secure write: leave a channel. Resolves user ID server-side.
 */
export const leaveChannel = createServerFn({ method: "POST" })
  .validator((channelId: string) => channelId)
  .handler(async ({ data: channelId }) => {
    const user = await requireAuth();
    await db.channelMembership.deleteMany({
      where: {
        userId: user.id,
        channelId,
      },
    });
    return { success: true };
  });
