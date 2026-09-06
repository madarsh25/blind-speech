import { createServerFn } from "@tanstack/react-start";
import { db } from "./db";
import { requireAuth } from "./auth-server";
import { checkRateLimit } from "./rate-limit";

/**
 * Mutating write: Submit a report for a post or comment.
 * Authenticated, rate-limited to 10 reports/hour.
 */
export const reportContent = createServerFn({ method: "POST" })
  .validator((data: { postId?: string; commentId?: string; reason: string }) => {
    const reason = data.reason.trim();
    if (!reason) {
      throw new Error("Reason is required to submit a report");
    }
    if ((data.postId && data.commentId) || (!data.postId && !data.commentId)) {
      throw new Error("Report must target exactly one post or one comment");
    }
    return { postId: data.postId, commentId: data.commentId, reason };
  })
  .handler(async ({ data: { postId, commentId, reason } }) => {
    const user = await requireAuth();

    if (!checkRateLimit(`user-${user.id}:report`, 10, 3600000)) {
      throw new Error("Rate limit exceeded: You can only file up to 10 reports per hour.");
    }

    const report = await db.report.create({
      data: {
        reporterId: user.id,
        postId: postId || null,
        commentId: commentId || null,
        reason,
      },
    });

    return { success: true, id: report.id };
  });

/**
 * Public read: fetch all reports for a channel.
 * Restriced to channel creators.
 */
export const getReportsByChannel = createServerFn({ method: "GET" })
  .validator((channelId: string) => channelId)
  .handler(async ({ data: channelId }) => {
    const user = await requireAuth();

    const channel = await db.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel || channel.createdById !== user.id) {
      throw new Error("Unauthorized: Only the channel creator can view reports.");
    }

    const reports = await db.report.findMany({
      where: {
        OR: [
          { post: { channelId } },
          { comment: { post: { channelId } } }
        ]
      },
      include: {
        post: { select: { title: true, content: true } },
        comment: { select: { content: true } },
        reporter: { select: { username: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    return reports.map((r) => ({
      id: r.id,
      postId: r.postId,
      commentId: r.commentId,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      targetType: r.postId ? "post" : "comment",
      targetContent: r.postId ? r.post?.title || r.post?.content : r.comment?.content,
      reporterName: r.reporter.username
    }));
  });

/**
 * Mutating write: Moderate reported content (dismiss or soft delete).
 * Restriced to channel creators.
 */
export const moderateContent = createServerFn({ method: "POST" })
  .validator((data: { reportId: string; action: "dismiss" | "delete" }) => data)
  .handler(async ({ data: { reportId, action } }) => {
    const user = await requireAuth();

    const report = await db.report.findUnique({
      where: { id: reportId },
      include: {
        post: true,
        comment: true
      }
    });

    if (!report) throw new Error("Report not found");

    let resolvedChannelId = null;
    if (report.post) {
      resolvedChannelId = report.post.channelId;
    } else if (report.comment) {
      const post = await db.post.findUnique({ where: { id: report.comment.postId } });
      resolvedChannelId = post?.channelId;
    }

    if (!resolvedChannelId) throw new Error("Could not resolve target channel");

    const channel = await db.channel.findUnique({ where: { id: resolvedChannelId } });
    if (!channel || channel.createdById !== user.id) {
      throw new Error("Unauthorized: Only the channel creator can moderate content");
    }

    if (action === "dismiss") {
      await db.report.update({
        where: { id: reportId },
        data: { status: "dismissed" }
      });
    } else if (action === "delete") {
      if (report.postId) {
        await db.post.update({
          where: { id: report.postId },
          data: { isDeleted: true }
        });
      } else if (report.commentId) {
        await db.comment.update({
          where: { id: report.commentId },
          data: { isDeleted: true }
        });
      }

      await db.report.update({
        where: { id: reportId },
        data: { status: "reviewed" }
      });
    }

    return { success: true };
  });
