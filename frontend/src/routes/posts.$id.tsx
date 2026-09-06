import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { 
  ArrowLeft, LogOut, ChevronUp, 
  ChevronDown, MessageCircle, Reply, Lock, ArrowRight
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

  // Recursive component for nested comment rendering
  function CommentComponent({ comment, depth = 0 }: { comment: CommentNode; depth?: number }) {
    const [isReplying, setIsReplying] = useState(false);
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

    return (
      <div className="space-y-3 font-sans">
        <div className="bg-canvas/40 p-4 rounded-lg border border-hairline-soft flex gap-3">
          {/* Vote control */}
          <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
            <button
              onClick={() => handleCommentVote(1)}
              className={`p-0.5 rounded hover:bg-canvas transition-colors cursor-pointer ${
                comment.userVote === 1 ? "text-coral" : "text-muted-soft"
              }`}
            >
              <ChevronUp className="w-5 h-5" />
            </button>
            <span className="text-[12px] font-bold font-mono text-ink">{comment.voteScore}</span>
            <button
              onClick={() => handleCommentVote(-1)}
              className={`p-0.5 rounded hover:bg-canvas transition-colors cursor-pointer ${
                comment.userVote === -1 ? "text-blue-500" : "text-muted-soft"
              }`}
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>

          {/* Comment detail */}
          <div className="flex-grow min-w-0">
            <div className="flex items-center gap-2 text-[11.5px] text-muted-ink mb-1.5">
              <span className="font-semibold text-ink">{comment.username}</span>
              {comment.companyDomain && (
                <span className="inline-flex items-center px-1.5 rounded-pill bg-canvas text-[10.5px] font-semibold border border-hairline-soft font-mono">
                  {comment.companyDomain}
                </span>
              )}
              <span>•</span>
              <span>{new Date(comment.createdAt).toISOString().split("T")[0]}</span>
            </div>

            <p className="text-[13.5px] leading-relaxed text-body">{comment.content}</p>

            <button
              onClick={() => {
                if (!loaderUser) {
                  setShowAuthPrompt(true);
                } else {
                  setIsReplying(!isReplying);
                }
              }}
              className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-semibold text-coral hover:text-coral-active cursor-pointer"
            >
              <Reply className="w-3.5 h-3.5" /> Reply
            </button>

            {isReplying && (
              <form onSubmit={handleSaveReply} className="mt-3 flex gap-2">
                <input
                  type="text"
                  required
                  placeholder={`Reply to @${comment.username}...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  disabled={isSaving}
                  className="flex-grow bg-canvas text-ink px-3 py-1.5 text-[13px] rounded-md hairline focus:outline-none focus:border-coral"
                />
                <button
                  type="submit"
                  disabled={isSaving || !replyText.trim()}
                  className="bg-coral hover:bg-coral-active text-white text-[12px] font-medium px-4 rounded-md cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Reply"}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Recursive rendering of replies (indented up to 4 levels) */}
        {comment.replies && comment.replies.length > 0 && (
          <div className={`space-y-3 ${depth < 4 ? "ml-6 pl-4 border-l border-hairline-soft/80" : ""}`}>
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
      <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-md border-b border-hairline-soft px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <SpikeMark className="w-5 h-5 text-coral" />
          <span className="font-display text-[22px] leading-none tracking-tight font-medium">the tweeting platform</span>
        </Link>
        <div className="flex items-center gap-4">
          {loaderUser ? (
            <>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-pill bg-coral/10 text-coral font-mono text-[12px] font-semibold">
                @{loaderUser.username} · {loaderUser.companyDomain}
              </span>
              <button onClick={handleLogout} className="text-muted-ink hover:text-ink cursor-pointer" title="Sign Out">
                <LogOut className="w-4.5 h-4.5" />
              </button>
            </>
          ) : (
            <Link
              to="/"
              className="bg-coral hover:bg-coral-active text-white text-[13px] px-3.5 py-1.5 font-medium rounded-md transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Guest/View-Only Alert Bar */}
      {!loaderUser && (
        <div className="bg-coral/10 border-b border-coral/25 px-6 py-2.5 text-center text-[13px] text-coral font-medium flex items-center justify-center gap-2">
          <Lock className="w-4 h-4" />
          <span>You are browsing in View-Only Mode. Sign in to contribute!</span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-grow max-w-[840px] w-full mx-auto px-6 py-8 space-y-6">
        
        {/* Back Link */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-muted-ink hover:text-ink transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Feed
        </Link>

        {/* Main Post Card */}
        <article className="bg-surface-card rounded-lg p-6 hairline animate-fade-up flex gap-4">
          {/* Vote Column */}
          <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
            <button
              onClick={() => handlePostVote(1)}
              className={`p-1 rounded hover:bg-canvas transition-colors cursor-pointer ${
                post.userVote === 1 ? "text-coral" : "text-muted-soft"
              }`}
            >
              <ChevronUp className="w-6 h-6" />
            </button>
            <span className={`text-[14px] font-bold font-mono ${
              post.userVote === 1 ? "text-coral" : post.userVote === -1 ? "text-blue-500" : "text-ink"
            }`}>
              {post.voteScore}
            </span>
            <button
              onClick={() => handlePostVote(-1)}
              className={`p-1 rounded hover:bg-canvas transition-colors cursor-pointer ${
                post.userVote === -1 ? "text-blue-500" : "text-muted-soft"
              }`}
            >
              <ChevronDown className="w-6 h-6" />
            </button>
          </div>

          {/* Content Column */}
          <div className="flex-grow min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-ink mb-2">
              <span className="font-semibold text-coral">#{post.channelName}</span>
              <span>•</span>
              <span>{post.username}</span>
              <span className="inline-flex items-center px-1.5 py-0.2 rounded-pill bg-canvas text-[11px] font-semibold border border-hairline-soft font-mono">
                {post.companyDomain}
              </span>
              <span>•</span>
              <span>{new Date(post.createdAt).toISOString().split("T")[0]}</span>
            </div>

            <h2 className="font-display text-[24px] text-ink leading-snug">
              {post.title}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-body whitespace-pre-wrap font-sans">
              {post.content}
            </p>
          </div>
        </article>

        {/* Comment Writing Card */}
        <div className="bg-surface-card rounded-lg p-6 hairline animate-fade-up">
          <h4 className="caption-upper text-[11px] text-muted-ink mb-3 font-semibold">Join the discussion</h4>
          <form onSubmit={handleCreateTopComment} className="flex gap-2">
            <input
              type="text"
              required
              placeholder="What are your thoughts?"
              value={topCommentText}
              onChange={(e) => setTopCommentText(e.target.value)}
              disabled={isSubmitting}
              className="flex-grow bg-canvas text-ink px-4 py-2.5 text-[14px] rounded-md hairline focus:outline-none focus:border-coral"
            />
            <button
              type="submit"
              disabled={isSubmitting || !topCommentText.trim()}
              className="bg-coral hover:bg-coral-active text-white px-5 h-11 rounded-md text-[13px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50 font-sans"
            >
              {isSubmitting ? "Submitting..." : "Comment"}
            </button>
          </form>
        </div>

        {/* Comments Section */}
        <div className="space-y-6">
          <h3 className="caption-upper text-[12px] text-muted-ink font-bold pb-2 border-b border-hairline-soft">
            Discussion ({flatComments.length})
          </h3>

          {flatComments.length === 0 ? (
            <div className="bg-surface-card rounded-lg p-10 text-center hairline">
              <MessageCircle className="w-10 h-10 text-muted-soft mx-auto mb-3" />
              <p className="text-[13.5px] text-muted-ink font-sans">
                No comments shared yet. Share your thoughts above!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {flatComments.map((comment) => (
                <CommentComponent key={comment.id} comment={comment} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* AUTH PROMPT DIALOG */}
      {showAuthPrompt && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-surface-card max-w-[400px] w-full rounded-xl p-6 hairline shadow-2xl animate-fade-up font-sans">
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
                  className="w-full bg-coral hover:bg-coral-active text-white py-2.5 rounded-md font-medium text-[13.5px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  Verify Email <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowAuthPrompt(false)}
                  className="w-full text-muted-ink hover:text-ink hover:bg-canvas py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer"
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
