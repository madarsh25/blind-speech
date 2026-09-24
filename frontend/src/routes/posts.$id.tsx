import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { 
  ArrowLeft, LogOut, ChevronUp, 
  ChevronDown, MessageCircle, Reply, Lock, ArrowRight, Minus, Plus
} from "lucide-react";
import { api } from "../api/client";
import { CommentNode } from "@blind-speech/shared";

export const Route = createFileRoute("/posts/$id")({
  loader: async ({ params }) => {
    const user = await api.auth.getMe();
    const post = await api.posts.getById(params.id);
    const comments = await api.comments.listByPost(params.id);
    return { loaderUser: user, loaderPost: post, loaderComments: comments };
  },
  component: PostDetailPage,
});

function SpikeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 1.5c.3 3.6 1.4 6.6 3.4 8.7 2 2 5 3.1 8.6 3.4v-3.2c-2.5-.2-4.5-1-5.9-2.4-1.4-1.4-2.2-3.4-2.4-5.9zM12 22.5c-.3-3.6-1.4-6.6-3.4-8.7-2-2-5-3.1-8.6-3.4v3.2c2.5.2 4.5 1 5.9 2.4 1.4 1.4 2.2 3.4 2.4 5.9zM22.5 12c-3.6.3-6.6 1.4-8.7 3.4-2 2-3.1 5-3.4 8.6h3.2c.2-2.5 1-4.5 2.4-5.9 1.4-1.4 3.4-2.2 5.9-2.4zM1.5 12c3.6-.3 6.6-1.4 8.7-3.4 2-2 3.1-5 3.4-8.6h-3.2c-.2 2.5-1 4.5-2.4 5.9-1.4 1.4-3.4 2.2-5.9 2.4z" />
    </svg>
  );
}

function PostDetailPage() {
  const { loaderUser, loaderPost, loaderComments } = Route.useLoaderData();
  const navigate = useNavigate();

  // State
  const [post, setPost] = useState(loaderPost);
  const [flatComments, setFlatComments] = useState<CommentNode[]>(loaderComments.comments);
  const [topCommentText, setTopCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const fetchComments = async () => {
    try {
      const list = await api.comments.listByPost(post.id);
      setFlatComments(list.comments);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = async () => {
    await api.auth.logout();
    navigate({ to: "/" });
    window.location.reload();
  };

  const handlePostVote = async (targetValue: number) => {
    if (!loaderUser) {
      setShowAuthPrompt(true);
      return;
    }
    const currentVote = post.userVote;
    const newValue = currentVote === targetValue ? 0 : targetValue;
    
    setPost(prev => {
      const diff = newValue - currentVote;
      return { ...prev, userVote: newValue, voteScore: prev.voteScore + diff };
    });

    try {
      await api.posts.vote(post.id, { value: newValue });
    } catch (e) {
      console.error(e);
      const updated = await api.posts.getById(post.id);
      setPost(updated);
    }
  };

  const handleCreateTopComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loaderUser) {
      setShowAuthPrompt(true);
      return;
    }
    if (!topCommentText.trim()) return;
    setIsSubmitting(true);

    try {
      const res = await api.comments.create(post.id, {
        content: topCommentText,
      });
      if (res.success) {
        setTopCommentText("");
        await fetchComments();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Recursive component for nested comment rendering with collapsible replies
  function CommentComponent({ comment, depth = 0 }: { comment: CommentNode; depth?: number }) {
    const [isReplying, setIsReplying] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    const handleCommentVote = async (targetValue: number) => {
      if (!loaderUser) {
        setShowAuthPrompt(true);
        return;
      }
      const currentVote = comment.userVote;
      const newValue = currentVote === targetValue ? 0 : targetValue;

      // Optimistic Update
      setFlatComments(prev => {
        const updateRecursive = (nodes: CommentNode[]): CommentNode[] => {
          return nodes.map(c => {
            if (c.id === comment.id) {
              const diff = newValue - currentVote;
              return { ...c, userVote: newValue, voteScore: c.voteScore + diff };
            }
            if (c.replies && c.replies.length > 0) {
              return { ...c, replies: updateRecursive(c.replies) };
            }
            return c;
          });
        };
        return updateRecursive(prev);
      });

      try {
        await api.comments.vote(comment.id, { value: newValue });
      } catch (e) {
        console.error(e);
        fetchComments();
      }
    };

    const handleSaveReply = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!loaderUser) {
        setShowAuthPrompt(true);
        return;
      }
      if (!replyText.trim()) return;
      setIsSaving(true);

      try {
        const res = await api.comments.create(post.id, {
          content: replyText,
          parentId: comment.id,
        });
        if (res.success) {
          setReplyText("");
          setIsReplying(false);
          await fetchComments();
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSaving(false);
      }
    };

    const hasReplies = comment.replies && comment.replies.length > 0;

    return (
      <div className="space-y-2.5 font-sans">
        <div className="bg-surface-card/60 sm:bg-canvas/40 p-3 sm:p-4 rounded-xl border border-hairline-soft flex gap-2.5 sm:gap-3">
          {/* Vote control with touch-friendly dimensions */}
          <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
            <button
              onClick={() => handleCommentVote(1)}
              className={`p-1.5 sm:p-1 rounded hover:bg-canvas active:scale-90 transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center ${
                comment.userVote === 1 ? "text-coral" : "text-muted-soft"
              }`}
              aria-label="Upvote comment"
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <span className="text-[11.5px] sm:text-[12px] font-bold font-mono text-ink">{comment.voteScore}</span>
            <button
              onClick={() => handleCommentVote(-1)}
              className={`p-1.5 sm:p-1 rounded hover:bg-canvas active:scale-90 transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center ${
                comment.userVote === -1 ? "text-blue-500" : "text-muted-soft"
              }`}
              aria-label="Downvote comment"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>

          {/* Comment detail */}
          <div className="flex-grow min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] sm:text-[11.5px] text-muted-ink mb-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-ink">{comment.username}</span>
                {comment.companyDomain && (
                  <span className="inline-flex items-center px-1.5 py-0.2 rounded-pill bg-canvas text-[10px] sm:text-[10.5px] font-semibold border border-hairline-soft font-mono">
                    {comment.companyDomain}
                  </span>
                )}
                <span>•</span>
                <span>{new Date(comment.createdAt).toISOString().split("T")[0]}</span>
              </div>

              {hasReplies && (
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="text-muted-ink hover:text-ink text-[11px] font-mono flex items-center gap-1 py-1 px-1.5 rounded cursor-pointer"
                  title={isCollapsed ? "Expand replies" : "Collapse replies"}
                >
                  {isCollapsed ? (
                    <span className="flex items-center gap-0.5 text-coral font-sans font-medium">
                      <Plus className="w-3 h-3" /> {comment.replies.length} {comment.replies.length === 1 ? "reply" : "replies"}
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5">
                      <Minus className="w-3 h-3" /> collapse
                    </span>
                  )}
                </button>
              )}
            </div>

            <p className="text-[13px] sm:text-[13.5px] leading-relaxed text-body break-words">{comment.content}</p>

            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => {
                  if (!loaderUser) {
                    setShowAuthPrompt(true);
                  } else {
                    setIsReplying(!isReplying);
                  }
                }}
                className="inline-flex items-center gap-1 text-[12px] sm:text-[11.5px] font-semibold text-coral hover:text-coral-active active:scale-95 py-1.5 px-2 -ml-2 rounded cursor-pointer min-h-[36px]"
              >
                <Reply className="w-3.5 h-3.5" /> Reply
              </button>
            </div>

            {isReplying && (
              <form onSubmit={handleSaveReply} className="mt-2.5 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  required
                  placeholder={`Reply to @${comment.username}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={isSaving}
                  className="flex-grow bg-canvas text-ink px-3 py-2 text-[16px] sm:text-[13px] rounded-md hairline focus:outline-none focus:border-coral"
                />
                <button
                  type="submit"
                  disabled={isSaving || !replyText.trim()}
                  className="bg-coral hover:bg-coral-active active:scale-95 text-white text-[13px] sm:text-[12px] font-medium px-4 py-2 sm:py-0 rounded-md cursor-pointer disabled:opacity-50 min-h-[40px] flex items-center justify-center shrink-0"
                >
                  {isSaving ? "Saving..." : "Reply"}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Recursive rendering of replies (responsive indentation that does not squash text on mobile) */}
        {hasReplies && !isCollapsed && (
          <div className={`space-y-2.5 ${depth < 4 ? "ml-2.5 sm:ml-5 pl-2 sm:pl-3.5 border-l-2 sm:border-l border-hairline-soft/90" : "ml-1 pl-1"}`}>
            {comment.replies.map((reply) => (
              <CommentComponent key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-canvas font-sans text-ink">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-canvas/90 backdrop-blur-md border-b border-hairline-soft px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <SpikeMark className="w-5 h-5 text-coral shrink-0" />
          <span className="font-display text-[18px] sm:text-[22px] leading-none tracking-tight font-medium truncate">the tweeting platform</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {loaderUser ? (
            <>
              <span className="inline-flex items-center max-w-[130px] sm:max-w-none truncate px-2.5 py-1 rounded-pill bg-coral/10 text-coral font-mono text-[11px] sm:text-[12px] font-semibold">
                @{loaderUser.username}
              </span>
              <button 
                onClick={handleLogout} 
                className="text-muted-ink hover:text-ink cursor-pointer p-2 min-w-[40px] min-h-[40px] flex items-center justify-center" 
                title="Sign Out"
                aria-label="Sign out"
              >
                <LogOut className="w-4.5 h-4.5" />
              </button>
            </>
          ) : (
            <Link
              to="/"
              className="bg-coral hover:bg-coral-active active:scale-95 text-white text-[13px] px-3.5 py-1.5 font-medium rounded-md transition-all"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Guest/View-Only Alert Bar */}
      {!loaderUser && (
        <div className="bg-coral/10 border-b border-coral/25 px-4 py-2.5 text-center text-[12.5px] sm:text-[13px] text-coral font-medium flex items-center justify-center gap-2">
          <Lock className="w-4 h-4 shrink-0" />
          <span>View-Only Mode. Sign in to contribute!</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-grow max-w-[840px] w-full mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        
        {/* Back Link */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-[13.5px] sm:text-[14px] font-medium text-muted-ink hover:text-ink transition-colors min-h-[36px]">
          <ArrowLeft className="w-4 h-4" /> Back to Feed
        </Link>

        {/* Main Post Card */}
        <article className="bg-surface-card rounded-xl p-4 sm:p-6 hairline animate-fade-up flex gap-3 sm:gap-4">
          {/* Vote Column with ~44px touch target */}
          <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
            <button
              onClick={() => handlePostVote(1)}
              className={`p-2 sm:p-1 rounded hover:bg-canvas active:scale-90 transition-all cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center ${
                post.userVote === 1 ? "text-coral" : "text-muted-soft"
              }`}
              aria-label="Upvote post"
            >
              <ChevronUp className="w-6 h-6" />
            </button>
            <span className={`text-[13px] sm:text-[14px] font-bold font-mono ${
              post.userVote === 1 ? "text-coral" : post.userVote === -1 ? "text-blue-500" : "text-ink"
            }`}>
              {post.voteScore}
            </span>
            <button
              onClick={() => handlePostVote(-1)}
              className={`p-2 sm:p-1 rounded hover:bg-canvas active:scale-90 transition-all cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center ${
                post.userVote === -1 ? "text-blue-500" : "text-muted-soft"
              }`}
              aria-label="Downvote post"
            >
              <ChevronDown className="w-6 h-6" />
            </button>
          </div>

          {/* Content Column */}
          <div className="flex-grow min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] sm:text-[12px] text-muted-ink mb-2">
              <span className="font-semibold text-coral">#{post.channelName}</span>
              <span>•</span>
              <span className="font-medium text-ink">{post.username}</span>
              <span className="inline-flex items-center px-1.5 py-0.2 rounded-pill bg-canvas text-[10.5px] sm:text-[11px] font-semibold border border-hairline-soft font-mono">
                {post.companyDomain}
              </span>
              <span>•</span>
              <span>{new Date(post.createdAt).toISOString().split("T")[0]}</span>
            </div>

            <h2 className="font-display text-[20px] sm:text-[24px] text-ink leading-snug break-words">
              {post.title}
            </h2>
            <p className="mt-3 sm:mt-4 text-[14px] sm:text-[15px] leading-relaxed text-body whitespace-pre-wrap font-sans break-words">
              {post.content}
            </p>
          </div>
        </article>

        {/* Comment Writing Card */}
        <div className="bg-surface-card rounded-xl p-4 sm:p-6 hairline animate-fade-up">
          <h4 className="caption-upper text-[11px] text-muted-ink mb-2.5 font-semibold">Join the discussion</h4>
          <form onSubmit={handleCreateTopComment} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              required
              placeholder="What are your thoughts?"
              value={topCommentText}
              onChange={(e) => setTopCommentText(e.target.value)}
              disabled={isSubmitting}
              className="flex-grow bg-canvas text-ink px-3.5 py-2.5 text-[16px] sm:text-[14px] rounded-md hairline focus:outline-none focus:border-coral"
            />
            <button
              type="submit"
              disabled={isSubmitting || !topCommentText.trim()}
              className="bg-coral hover:bg-coral-active active:scale-[0.98] text-white px-5 min-h-[44px] sm:h-11 rounded-md text-[13.5px] sm:text-[13px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-50 shrink-0 font-sans"
            >
              {isSubmitting ? "Submitting..." : "Comment"}
            </button>
          </form>
        </div>

        {/* Comments Section */}
        <div className="space-y-4 sm:space-y-6">
          <h3 className="caption-upper text-[11.5px] sm:text-[12px] text-muted-ink font-bold pb-2 border-b border-hairline-soft">
            Discussion ({flatComments.length})
          </h3>

          {flatComments.length === 0 ? (
            <div className="bg-surface-card rounded-xl p-8 sm:p-10 text-center hairline">
              <MessageCircle className="w-8 h-8 sm:w-10 sm:h-10 text-muted-soft mx-auto mb-2.5" />
              <p className="text-[13px] sm:text-[13.5px] text-muted-ink font-sans">
                No comments shared yet. Share your thoughts above!
              </p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {flatComments.map((comment) => (
                <CommentComponent key={comment.id} comment={comment} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* AUTH PROMPT DIALOG */}
      {showAuthPrompt && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="bg-surface-card max-w-[400px] w-full max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-xl p-5 sm:p-6 hairline shadow-2xl animate-fade-up font-sans">
            <div className="text-center">
              <div className="w-12 h-12 bg-coral/10 text-coral rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="font-display text-[22px] text-ink mb-2">Verification Required</h3>
              <p className="text-[13.5px] text-muted-ink mb-6">
                You must verify your workplace email address to post, vote, or join communities.
              </p>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => {
                    setShowAuthPrompt(false);
                    navigate({ to: "/" });
                  }}
                  className="w-full bg-coral hover:bg-coral-active active:scale-[0.98] text-white min-h-[44px] py-2.5 rounded-md font-medium text-[13.5px] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  Verify Email <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuthPrompt(false)}
                  className="w-full text-muted-ink hover:text-ink hover:bg-canvas min-h-[40px] py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer"
                >
                  Keep Browsing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
