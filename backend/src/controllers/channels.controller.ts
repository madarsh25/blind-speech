import { Request, Response } from "express";
import { db } from "../lib/db.js";
import { checkRateLimit } from "../lib/rate-limit.js";

export async function getChannels(req: Request, res: Response) {
  try {
    const user = req.user;
    const channels = await db.channel.findMany({
      include: {
        _count: {
          select: { posts: true, memberships: true },
        },
        memberships: user ? { where: { userId: user.id } } : false,
      },
      orderBy: { name: "asc" },
    });

    const data = channels.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      postCount: c._count.posts,
      memberCount: c._count.memberships,
      isMember: user ? c.memberships.length > 0 : false,
    }));

    return res.json({ success: true, data });
  } catch (e: any) {
    console.error("getChannels error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to fetch channels" });
  }
}

export async function getChannelBySlug(req: Request, res: Response) {
  try {
    const name = (req.params.slug || "").toLowerCase().trim();
    const user = req.user;

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
      return res.status(404).json({ success: false, error: "Channel not found" });
    }

    const data = {
      id: channel.id,
      name: channel.name,
      description: channel.description,
      postCount: channel._count.posts,
      memberCount: channel._count.memberships,
      isMember: user ? channel.memberships.length > 0 : false,
    };

    return res.json({ success: true, data });
  } catch (e: any) {
    console.error("getChannelBySlug error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to fetch channel" });
  }
}

export async function createChannel(req: Request, res: Response) {
  try {
    const user = req.user!;
    const { name: rawName, description: rawDesc } = req.body;

    const name = (rawName || "").toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
    if (name.length < 3 || name.length > 25) {
      return res.status(400).json({
        success: false,
        error: "Channel name must be between 3 and 25 alphanumeric characters",
      });
    }

    const description = (rawDesc || "").trim();

    if (!checkRateLimit(`user-${user.id}:create-channel`, 5, 3600000)) {
      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded: You can only create up to 5 channels per hour.",
      });
    }

    const existing = await db.channel.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: `Channel #${name} already exists`,
      });
    }

    const channel = await db.channel.create({
      data: {
        name,
        description,
        createdById: user.id,
      },
    });

    // Auto-join creator to their channel
    await db.channelMembership.create({
      data: {
        userId: user.id,
        channelId: channel.id,
      },
    });

    return res.json({ success: true, data: { name: channel.name, id: channel.id } });
  } catch (e: any) {
    console.error("createChannel error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to create channel" });
  }
}

export async function joinChannel(req: Request, res: Response) {
  try {
    const user = req.user!;
    const channelId = req.params.id;

    if (!channelId) {
      return res.status(400).json({ success: false, error: "Channel ID is required" });
    }

    if (!checkRateLimit(`user-${user.id}:join-channel`, 30, 3600000)) {
      return res.status(429).json({
        success: false,
        error: "Rate limit exceeded: You can only join up to 30 channels per hour.",
      });
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

    return res.json({ success: true });
  } catch (e: any) {
    console.error("joinChannel error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to join channel" });
  }
}

export async function leaveChannel(req: Request, res: Response) {
  try {
    const user = req.user!;
    const channelId = req.params.id;

    if (!channelId) {
      return res.status(400).json({ success: false, error: "Channel ID is required" });
    }

    await db.channelMembership.deleteMany({
      where: {
        userId: user.id,
        channelId,
      },
    });

    return res.json({ success: true });
  } catch (e: any) {
    console.error("leaveChannel error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to leave channel" });
  }
}
