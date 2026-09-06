import { Request, Response } from "express";
import { db } from "../lib/db.js";
import { checkRateLimit } from "../lib/rate-limit.js";

export async function reportContent(req: Request, res: Response) {
  try {
    const user = req.user!;
    const { postId, commentId, reason: rawReason } = req.body;

    const reason = (rawReason || "").trim();
    if (!reason) {
      return res.status(400).json({ success: false, error: "Reason is required to submit a report" });
    }
    if ((postId && commentId) || (!postId && !commentId)) {
      return res.status(400).json({ success: false, error: "Report must target exactly one post or one comment" });
    }

    if (!checkRateLimit(`user-${user.id}:report`, 10, 3600000)) {
      return res.status(429).json({ success: false, error: "Rate limit exceeded: You can only file up to 10 reports per hour." });
    }

    const report = await db.report.create({
      data: {
        reporterId: user.id,
        postId: postId || null,
        commentId: commentId || null,
        reason,
      },
    });

    return res.json({ success: true, data: { id: report.id } });
  } catch (e: any) {
    console.error("reportContent error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to submit report" });
  }
}

export async function getReportsByChannel(req: Request, res: Response) {
  try {
    const user = req.user!;
    const channelId = req.params.channelId;

    if (!channelId) {
      return res.status(400).json({ success: false, error: "Channel ID is required" });
    }

    const channel = await db.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel || channel.createdById !== user.id) {
      return res.status(403).json({ success: false, error: "Unauthorized: Only the channel creator can view reports." });
    }

    const reports = await db.report.findMany({
      where: {
        OR: [
          { post: { channelId } },
          { comment: { post: { channelId } } },
        ],
      },
      include: {
        post: { select: { title: true, content: true } },
        comment: { select: { content: true } },
        reporter: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = reports.map((r) => ({
      id: r.id,
      postId: r.postId,
      commentId: r.commentId,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      targetType: r.postId ? "post" : "comment",
      targetContent: r.postId ? r.post?.title || r.post?.content : r.comment?.content,
      reporterName: r.reporter.username,
    }));

    return res.json({ success: true, data });
  } catch (e: any) {
    console.error("getReportsByChannel error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to fetch reports" });
  }
}

export async function moderateContent(req: Request, res: Response) {
  try {
    const user = req.user!;
    const reportId = req.params.id;
    const { action } = req.body;

    if (!reportId) {
      return res.status(400).json({ success: false, error: "Report ID is required" });
    }
    if (action !== "dismiss" && action !== "delete") {
      return res.status(400).json({ success: false, error: "Action must be 'dismiss' or 'delete'" });
    }

    const report = await db.report.findUnique({
      where: { id: reportId },
      include: {
        post: true,
        comment: true,
      },
    });

    if (!report) {
      return res.status(404).json({ success: false, error: "Report not found" });
    }

    let resolvedChannelId = null;
    if (report.post) {
      resolvedChannelId = report.post.channelId;
    } else if (report.comment) {
      const post = await db.post.findUnique({ where: { id: report.comment.postId } });
      resolvedChannelId = post?.channelId;
    }

    if (!resolvedChannelId) {
      return res.status(400).json({ success: false, error: "Could not resolve target channel" });
    }

    const channel = await db.channel.findUnique({ where: { id: resolvedChannelId } });
    if (!channel || channel.createdById !== user.id) {
      return res.status(403).json({ success: false, error: "Unauthorized: Only the channel creator can moderate content" });
    }

    if (action === "dismiss") {
      await db.report.update({
        where: { id: reportId },
        data: { status: "dismissed" },
      });
    } else if (action === "delete") {
      if (report.postId) {
        await db.post.update({
          where: { id: report.postId },
          data: { isDeleted: true },
        });
      } else if (report.commentId) {
        await db.comment.update({
          where: { id: report.commentId },
          data: { isDeleted: true },
        });
      }

      await db.report.update({
        where: { id: reportId },
        data: { status: "reviewed" },
      });
    }

    return res.json({ success: true });
  } catch (e: any) {
    console.error("moderateContent error:", e);
    return res.status(500).json({ success: false, error: e.message || "Failed to moderate content" });
  }
}
