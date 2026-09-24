import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  ArrowLeft, MessageSquare, Hash, LogOut, Clock, Flame, 
  BarChart2, ChevronUp, ChevronDown, Plus, Lock, ArrowRight, Compass, Menu
} from "lucide-react";
import { api } from "../api/client";

export const Route = createFileRoute("/channels/$slug")({
  loader: async ({ params }) => {
    const user = await api.auth.getMe();
    const channel = await api.channels.getBySlug(params.slug);
    const posts = await api.posts.list({ channelId: channel.id, sort: "new" });
    return { loaderUser: user, loaderChannel: channel, loaderPosts: posts };
  },
  component: ChannelPage,
});

function SpikeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 1.5c.3 3.6 1.4 6.6 3.4 8.7 2 2 5 3.1 8.6 3.4v-3.2c-2.5-.2-4.5-1-5.9-2.4-1.4-1.4-2.2-3.4-2.4-5.9zM12 22.5c-.3-3.6-1.4-6.6-3.4-8.7-2-2-5-3.1-8.6-3.4v3.2c2.5.2 4.5 1 5.9 2.4 1.4 1.4 2.2 3.4 2.4 5.9zM22.5 12c-3.6.3-6.6 1.4-8.7 3.4-2 2-3.1 5-3.4 8.6h3.2c.2-2.5 1-4.5 2.4-5.9 1.4-1.4 3.4-2.2 5.9-2.4zM1.5 12c3.6-.3 6.6-1.4 8.7-3.4 2-2 3.1-5 3.4-8.6h-3.2c-.2 2.5-1 4.5-2.4 5.9-1.4 1.4-3.4 2.2-5.9 2.4z" />
    </svg>
  );
}

function ChannelPage() {
  const { loaderUser, loaderChannel, loaderPosts } = Route.useLoaderData();
  const navigate = useNavigate();

  // State
  const [channel, setChannel] = useState(loaderChannel);
  const [posts, setPosts] = useState(loaderPosts);
  const [sortBy, setSortBy] = useState<"new" | "top" | "hot">("new");
  const [showPostModal, setShowPostModal] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const fetchFeed = async () => {
    try {
      const feedPosts = await api.posts.list({ channelId: channel.id, sort: sortBy });
      setPosts(feedPosts);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [sortBy]);

  const handleLogout = async () => {
    await api.auth.logout();
    navigate({ to: "/" });
    window.location.reload();
  };

  const handleToggleJoin = async () => {
    if (!loaderUser) {
      setShowAuthPrompt(true);
      return;
    }
    const isCurrentlyMember = channel.isMember;
    setChannel(prev => ({
      ...prev,
      isMember: !isCurrentlyMember,
      memberCount: isCurrentlyMember ? prev.memberCount - 1 : prev.memberCount + 1
    }));

    try {
      if (isCurrentlyMember) {
        await api.channels.leave(channel.id);
      } else {
        await api.channels.join(channel.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleVote = async (postId: string, currentVote: number, targetValue: number) => {
    if (!loaderUser) {
      setShowAuthPrompt(true);
      return;
    }
    const newValue = currentVote === targetValue ? 0 : targetValue;
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        const diff = newValue - currentVote;
        return { ...p, userVote: newValue, voteScore: p.voteScore + diff };
      }
      return p;
    }));

    try {
      await api.posts.vote(postId, { value: newValue });
    } catch (e) {
      console.error(e);
      fetchFeed();
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loaderUser) {
      setShowAuthPrompt(true);
      return;
    }
    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await api.posts.create({ 
        channelId: channel.id, title: postTitle, content: postContent 
      });
      if (res.success) {
        await fetchFeed();
        setShowPostModal(false);
        setPostTitle("");
        setPostContent("");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit post.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-canvas font-sans text-ink pb-16 md:pb-0">
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

      {/* Main Content */}
      <main className="flex-grow max-w-[840px] w-full mx-auto px-4 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        
        {/* Back Link */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-[13.5px] sm:text-[14px] font-medium text-muted-ink hover:text-ink transition-colors min-h-[36px]">
          <ArrowLeft className="w-4 h-4" /> Back to Feed
        </Link>

        {/* Channel Details Header Banner */}
        <div className="bg-surface-card rounded-xl p-4 sm:p-6 hairline animate-fade-up">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <h2 className="font-display text-[24px] sm:text-[28px] text-ink flex items-center gap-1.5 truncate">
                <Hash className="w-5 h-5 sm:w-6 sm:h-6 text-coral shrink-0" /> {channel.name}
              </h2>
              {channel.description && (
                <p className="mt-1.5 sm:mt-2 text-[13.5px] sm:text-[14.5px] text-muted-ink leading-relaxed break-words">{channel.description}</p>
              )}
            </div>
            <button
              onClick={handleToggleJoin}
              className={`w-full sm:w-auto px-4 py-2 sm:py-1.5 text-[13px] font-semibold border rounded-md cursor-pointer transition-all active:scale-[0.98] shrink-0 ${
                channel.isMember 
                  ? "bg-canvas text-muted-ink border-hairline hover:bg-red-50 hover:text-destructive hover:border-red-200" 
                  : "bg-coral text-white border-coral hover:bg-coral-active"
              }`}
            >
              {channel.isMember ? "Joined" : "Join Channel"}
            </button>
          </div>
          <div className="mt-3.5 sm:mt-4 text-[11.5px] sm:text-[12px] font-mono text-muted-soft flex items-center gap-4 border-t border-hairline-soft/45 pt-3">
            <span>{channel.memberCount} members</span>
            <span>{channel.postCount} posts</span>
          </div>
        </div>

        {/* Sorting tabs and Actions */}
        <div className="bg-surface-card rounded-xl p-3 sm:p-4 hairline flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-canvas/60 p-1 rounded-md hairline overflow-x-auto no-scrollbar max-w-full">
            {[
              { type: "new", icon: <Clock className="w-3.5 h-3.5" />, label: "New" },
              { type: "top", icon: <BarChart2 className="w-3.5 h-3.5" />, label: "Top" },
              { type: "hot", icon: <Flame className="w-3.5 h-3.5" />, label: "Hot" }
            ].map((s) => (
              <button
                key={s.type}
                onClick={() => setSortBy(s.type as any)}
                className={`px-3 py-1.5 rounded text-[12px] font-medium flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                  sortBy === s.type
                    ? "bg-surface-card text-coral font-semibold shadow-xs"
                    : "text-muted-ink hover:text-ink"
                }`}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              if (!loaderUser) {
                setShowAuthPrompt(true);
              } else {
                setShowPostModal(true);
              }
            }}
            className="w-full sm:w-auto bg-coral hover:bg-coral-active active:scale-[0.98] text-white text-[13px] px-4 py-2 font-medium rounded-md flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[40px]"
          >
            <Plus className="w-4 h-4" /> Post in #{channel.name}
          </button>
        </div>

        {/* Scoped Channel Feed */}
        <div className="space-y-3 sm:space-y-4">
          {posts.length === 0 ? (
            <div className="bg-surface-card rounded-xl p-8 sm:p-12 text-center hairline">
              <MessageSquare className="w-8 h-8 sm:w-10 sm:h-10 text-muted-soft mx-auto mb-3" />
              <h3 className="font-display text-[18px] sm:text-[20px] text-ink mb-1">No posts yet</h3>
              <p className="text-[13px] sm:text-[13.5px] text-muted-ink">
                Be the first to share an anonymous insight in #{channel.name}!
              </p>
            </div>
          ) : (
            posts.map((post) => (
              <article key={post.id} className="bg-surface-card rounded-xl p-4 sm:p-6 hairline animate-fade-up flex gap-3 sm:gap-4">
                {/* Vote Column with ~44px touch target */}
                <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
                  <button
                    onClick={() => handleVote(post.id, post.userVote, 1)}
                    className={`p-2 sm:p-1 rounded hover:bg-canvas active:scale-90 transition-all cursor-pointer min-w-[38px] min-h-[38px] flex items-center justify-center ${
                      post.userVote === 1 ? "text-coral" : "text-muted-soft"
                    }`}
                    aria-label="Upvote post"
                  >
                    <ChevronUp className="w-6 h-6" />
                  </button>
                  <span className={`text-[12.5px] sm:text-[13px] font-bold font-mono ${
                    post.userVote === 1 ? "text-coral" : post.userVote === -1 ? "text-blue-500" : "text-ink"
                  }`}>
                    {post.voteScore}
                  </span>
                  <button
                    onClick={() => handleVote(post.id, post.userVote, -1)}
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
                    <span className="font-semibold text-ink">{post.username}</span>
                    <span className="inline-flex items-center px-1.5 py-0.2 rounded-pill bg-canvas text-[10.5px] sm:text-[11px] font-semibold border border-hairline-soft font-mono">
                      {post.companyDomain}
                    </span>
                    <span>•</span>
                    <span>{new Date(post.createdAt).toISOString().split("T")[0]}</span>
                  </div>

                  <Link to="/posts/$id" params={{ id: post.id }} className="block group">
                    <h3 className="font-display text-[18px] sm:text-[20px] text-ink group-hover:text-coral transition-colors leading-snug break-words">
                      {post.title}
                    </h3>
                    <p className="mt-1.5 sm:mt-2 text-[13.5px] sm:text-[14px] leading-relaxed text-body line-clamp-3 font-sans break-words">
                      {post.content}
                    </p>
                  </Link>

                  <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-hairline-soft/60 flex items-center text-[12.5px] text-muted-ink">
                    <Link to="/posts/$id" params={{ id: post.id }} className="flex items-center gap-1.5 hover:text-ink transition-colors py-1">
                      <MessageSquare className="w-4 h-4" />
                      <span>{post.commentCount} comments</span>
                    </Link>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </main>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-canvas/95 backdrop-blur-md border-t border-hairline flex justify-around items-center h-14 md:hidden px-4">
        <Link
          to="/"
          className="flex flex-col items-center justify-center text-muted-ink hover:text-ink py-1 px-3 min-h-[44px]"
        >
          <Compass className="w-5.5 h-5.5" />
          <span className="text-[10px] mt-0.5 font-medium">Explore</span>
        </Link>

        <button
          onClick={() => {
            if (!loaderUser) {
              setShowAuthPrompt(true);
              return;
            }
            setShowPostModal(true);
          }}
          className="flex flex-col items-center justify-center text-coral py-1 px-3 min-h-[44px]"
        >
          <Plus className="w-6 h-6 p-1 bg-coral/15 rounded-full" />
          <span className="text-[10px] mt-0.5 font-medium">Post</span>
        </button>

        {!loaderUser ? (
          <button
            onClick={() => setShowAuthPrompt(true)}
            className="flex flex-col items-center justify-center text-muted-ink hover:text-ink py-1 px-3 min-h-[44px]"
          >
            <Lock className="w-5.5 h-5.5" />
            <span className="text-[10px] mt-0.5 font-medium">Sign In</span>
          </button>
        ) : (
          <button
            onClick={handleLogout}
            className="flex flex-col items-center justify-center text-muted-ink hover:text-ink py-1 px-3 min-h-[44px]"
          >
            <LogOut className="w-5.5 h-5.5" />
            <span className="text-[10px] mt-0.5 font-medium">Log Out</span>
          </button>
        )}
      </nav>

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

      {/* MODAL: Create Post */}
      {showPostModal && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 font-sans">
          <div className="bg-surface-card max-w-[600px] w-full max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-xl p-5 sm:p-6 hairline shadow-2xl animate-fade-up">
            <h3 className="font-display text-[20px] sm:text-display-sm text-ink mb-1.5">Create post in #{channel.name}</h3>
            <p className="text-[13px] sm:text-[13.5px] text-body mb-4">
              Share details or ask questions anonymously with members.
            </p>
            
            <form onSubmit={handleCreatePost} className="space-y-4">
              <div>
                <label className="caption-upper text-[11px] text-muted-ink block mb-1">Post Title</label>
                <input
                  type="text"
                  required
                  placeholder="Summarize your question..."
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-canvas text-ink px-3.5 py-2.5 text-[16px] sm:text-[14px] rounded-md hairline focus:outline-none focus:border-coral"
                />
              </div>

              <div>
                <label className="caption-upper text-[11px] text-muted-ink block mb-1">Content</label>
                <textarea
                  required
                  placeholder="Share details, context, or salary information..."
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  disabled={isLoading}
                  rows={5}
                  className="w-full bg-canvas text-ink px-3.5 py-2.5 text-[16px] sm:text-[14px] rounded-md hairline focus:outline-none focus:border-coral"
                />
              </div>

              {errorMsg && (
                <p className="text-destructive text-[13px] font-medium">{errorMsg}</p>
              )}

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="w-full sm:w-auto px-4 py-2.5 text-[13px] font-medium hover:bg-canvas rounded-md cursor-pointer min-h-[44px] flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || postTitle.length < 5 || postContent.length < 10}
                  className="w-full sm:w-auto bg-coral hover:bg-coral-active active:scale-[0.98] text-white px-5 py-2.5 text-[13.5px] sm:text-[13px] font-medium rounded-md cursor-pointer disabled:opacity-50 min-h-[44px] flex items-center justify-center"
                >
                  {isLoading ? "Submitting..." : "Post Anonymously"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
