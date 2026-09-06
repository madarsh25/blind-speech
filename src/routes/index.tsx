import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { 
  ArrowRight, Check, EyeOff, Lock, MessageSquare, ShieldCheck, ThumbsUp, 
  Mail, KeyRound, Cpu, LogOut, Plus, Hash, Compass, Clock, Flame, BarChart2,
  ChevronUp, ChevronDown, Search, Menu, X
} from "lucide-react";
import crypto from "crypto";
import { db } from "../lib/db";
import { encryptEmail } from "../lib/crypto";
import { sendOtpEmail } from "../lib/email";
import { getMe } from "../lib/me";
import { getChannels, createChannel, joinChannel, leaveChannel } from "../lib/channels";
import { getPosts, createPost, votePost, getTrendingHashtags } from "../lib/posts";

// Server function to request OTP verification email
export const requestOtp = createServerFn({ method: "POST" })
  .validator((email: string) => {
    const clean = email.toLowerCase().trim();
    if (!clean || !clean.includes("@") || clean.split("@")[1].split(".").length < 2) {
      throw new Error("Please enter a valid work email address");
    }
    const domain = clean.split("@")[1];
    const publicDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com"];
    
    // TODO: remove before production — temporary Resend sandbox testing bypass
    const isLocalDevBypass = process.env.NODE_ENV === "development" && clean === "adarsh.jy@gmail.com";

    if (publicDomains.includes(domain) && !isLocalDevBypass) {
      throw new Error("Please use your official work email (e.g. name@company.com)");
    }
    return clean;
  })
  .handler(async ({ data: email }) => {
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
      const encryptedEmail = encryptEmail(email);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      
      const verification = await db.otpVerification.create({
        data: {
          encryptedEmail,
          otpHash,
          expiresAt,
        },
      });

      await sendOtpEmail(email, otp);

      return { success: true, verificationId: verification.id };
    } catch (e: any) {
      console.error("OTP Request error:", e);
      throw new Error(e.message || "An unexpected error occurred while sending the OTP.");
    }
  });

// Server function to sign out / destroy cookie
export const logoutUser = createServerFn({ method: "POST" })
  .handler(async () => {
    const { deleteCookie } = await import("@tanstack/react-start/server");
    deleteCookie("tweeting_session", { path: "/" });
    return { success: true };
  });

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      const user = await getMe();
      const channels = await getChannels();
      const posts = await getPosts({ sort: "new" });
      const trending = await getTrendingHashtags({ data: 5 });
      
      return { 
        loaderUser: user, 
        loaderChannels: channels, 
        loaderPosts: posts,
        loaderTrending: trending 
      };
    } catch (err: any) {
      console.error("DEBUG - [index.tsx loader] Loader Error:", err);
      throw err;
    }
  },
  component: Dashboard,
});

function SpikeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 1.5c.3 3.6 1.4 6.6 3.4 8.7 2 2 5 3.1 8.6 3.4v-3.2c-2.5-.2-4.5-1-5.9-2.4-1.4-1.4-2.2-3.4-2.4-5.9zM12 22.5c-.3-3.6-1.4-6.6-3.4-8.7-2-2-5-3.1-8.6-3.4v3.2c2.5.2 4.5 1 5.9 2.4 1.4 1.4 2.2 3.4 2.4 5.9zM22.5 12c-3.6.3-6.6 1.4-8.7 3.4-2 2-3.1 5-3.4 8.6h3.2c.2-2.5 1-4.5 2.4-5.9 1.4-1.4 3.4-2.2 5.9-2.4zM1.5 12c3.6-.3 6.6-1.4 8.7-3.4 2-2 3.1-5 3.4-8.6h-3.2c-.2 2.5-1 4.5-2.4 5.9-1.4 1.4-3.4 2.2-5.9 2.4z" />
    </svg>
  );
}

function Dashboard() {
  const { loaderUser, loaderChannels, loaderPosts, loaderTrending } = Route.useLoaderData();
  const navigate = useNavigate();

  // View-Only & Guest experience states
  const [exploreViewOnly, setExploreViewOnly] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  // Layout states
  const [channels, setChannels] = useState(loaderChannels);
  const [posts, setPosts] = useState(loaderPosts);
  const [trendingTags, setTrendingTags] = useState(loaderTrending);
  const [feedMode, setFeedMode] = useState<"home" | "discover">("home");
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [activeHashtag, setActiveHashtag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"new" | "top" | "hot">("new");
  const [searchVal, setSearchVal] = useState("");
  
  // Mobile navigation states
  const [showMobileDrawer, setShowMobileDrawer] = useState(false);
  
  // Modals / forms
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  
  const [showPostModal, setShowPostModal] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postContent, setPostContent] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Load feed when filters, active channel, active hashtag or search changes
  const fetchFeed = async () => {
    setIsLoading(true);
    try {
      let feedPosts;
      if (activeHashtag) {
        const { getPostsByHashtag } = await import("../lib/posts");
        feedPosts = await getPostsByHashtag({ data: { tag: activeHashtag, sort: sortBy } });
      } else {
        feedPosts = await getPosts({ 
          channelId: activeChannelId || undefined, 
          sort: sortBy,
          searchQuery: searchVal || undefined
        });
      }
      setPosts(feedPosts);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only query joined feed filter if authenticated
    if (loaderUser || activeChannelId || activeHashtag || searchVal || sortBy) {
      fetchFeed();
    }
  }, [activeChannelId, activeHashtag, sortBy, searchVal, loaderUser]);

  // If user is not authenticated and has not clicked explore, render landing page
  if (!loaderUser && !exploreViewOnly) {
    return <LandingPage onExplore={() => setExploreViewOnly(true)} />;
  }

  // Handlers
  const handleLogout = async () => {
    await logoutUser();
    navigate({ to: "/" });
    window.location.reload();
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loaderUser) {
      setShowAuthPrompt(true);
      return;
    }
    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await createChannel({ data: { name: newChannelName, description: newChannelDesc } });
      if (res.success) {
        const updated = await getChannels();
        setChannels(updated);
        setShowChannelModal(false);
        setNewChannelName("");
        setNewChannelDesc("");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create channel.");
    } finally {
      setIsLoading(false);
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
      const res = await createPost({ 
        data: { channelId: selectedChannelId, title: postTitle, content: postContent } 
      });
      if (res.success) {
        await fetchFeed();
        const updatedTags = await getTrendingHashtags({ data: 5 });
        setTrendingTags(updatedTags);
        setShowPostModal(false);
        setPostTitle("");
        setPostContent("");
        setSelectedChannelId("");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit post.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async (postId: string, currentVote: number, targetValue: number) => {
    if (!loaderUser) {
      setShowAuthPrompt(true);
      return;
    }
    const newValue = currentVote === targetValue ? 0 : targetValue;
    
    // Optimistic Update
    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        const diff = newValue - currentVote;
        return {
          ...p,
          userVote: newValue,
          voteScore: p.voteScore + diff
        };
      }
      return p;
    }));

    try {
      await votePost({ data: { postId, value: newValue } });
    } catch (e) {
      console.error(e);
      fetchFeed();
    }
  };

  const handleToggleJoin = async (cId: string, isCurrentlyMember: boolean) => {
    if (!loaderUser) {
      setShowAuthPrompt(true);
      return;
    }
    
    // Optimistic Update
    setChannels(prev => prev.map(c => {
      if (c.id === cId) {
        return {
          ...c,
          isMember: !isCurrentlyMember,
          memberCount: isCurrentlyMember ? c.memberCount - 1 : c.memberCount + 1
        };
      }
      return c;
    }));

    try {
      if (isCurrentlyMember) {
        await leaveChannel({ data: cId });
      } else {
        await joinChannel({ data: cId });
      }
      await fetchFeed();
    } catch (e) {
      console.error(e);
    }
  };

  const clearAllFilters = () => {
    setActiveChannelId(null);
    setActiveHashtag(null);
    setSearchVal("");
    setSortBy("new");
  };

  return (
    <div className="flex flex-col min-h-screen bg-canvas font-sans text-ink">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-md border-b border-hairline-soft px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" onClick={clearAllFilters} className="flex items-center gap-2">
          <SpikeMark className="w-5 h-5 text-coral" />
          <span className="font-display text-[20px] sm:text-[22px] leading-none tracking-tight font-medium">the tweeting platform</span>
        </Link>
        <div className="flex items-center gap-3">
          <a
            href="https://blind-hire-alpha.vercel.app/"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-block text-[13.5px] font-medium text-muted-ink hover:text-ink transition-colors mr-2"
          >
            Get Hired
          </a>
          
          {loaderUser ? (
            <>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-pill bg-coral/10 text-coral font-mono text-[12px] font-semibold">
                @{loaderUser.username} · {loaderUser.companyDomain}
              </span>
              <button 
                onClick={handleLogout} 
                className="text-muted-ink hover:text-ink cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4.5 h-4.5" />
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setExploreViewOnly(false);
                setShowAuthPrompt(false);
              }}
              className="bg-coral hover:bg-coral-active text-white text-[13px] px-3.5 py-1.5 font-medium rounded-md transition-colors cursor-pointer"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Guest/View-Only Alert Bar */}
      {!loaderUser && (
        <div className="bg-coral/10 border-b border-coral/25 px-6 py-2.5 text-center text-[13px] text-coral font-medium flex items-center justify-center gap-2 font-sans">
          <Lock className="w-4 h-4" />
          <span>You are browsing in View-Only Mode. Sign in to contribute!</span>
        </div>
      )}

      {/* Main Layout Container */}
      <div className="flex-grow max-w-[1200px] w-full mx-auto px-4 sm:px-6 py-6 md:py-8 grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
        
        {/* Left Sidebar - Channels & Communities (Desktop only) */}
        <aside className="hidden md:block md:col-span-3 space-y-6">
          <div className="bg-surface-card rounded-lg p-5 hairline">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-hairline-soft">
              <span className="caption-upper text-[11px] text-muted-ink font-semibold tracking-wider">Communities</span>
              <button 
                onClick={() => {
                  if (!loaderUser) {
                    setShowAuthPrompt(true);
                  } else {
                    setShowChannelModal(true);
                  }
                }} 
                className="text-coral hover:text-coral-active cursor-pointer"
                title="Create Channel"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
              <button
                onClick={() => {
                  setActiveChannelId(null);
                  setActiveHashtag(null);
                  setFeedMode("home");
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-[13.5px] flex items-center gap-2 transition-colors ${
                  activeChannelId === null && activeHashtag === null && feedMode === "home"
                    ? "bg-canvas font-semibold hairline text-coral"
                    : "text-body hover:bg-canvas/50"
                }`}
              >
                <Compass className="w-4 h-4 shrink-0" />
                <span>{loaderUser ? "Joined Feed" : "Discover Feed"}</span>
              </button>

              {channels.map((c) => (
                <div key={c.id} className="group flex items-center justify-between rounded-md hover:bg-canvas/45">
                  <button
                    onClick={() => {
                      setActiveChannelId(c.id);
                      setActiveHashtag(null);
                      setFeedMode("discover");
                    }}
                    className={`flex-grow text-left px-3 py-2 rounded-l-md text-[13.5px] flex items-center gap-2 transition-colors truncate ${
                      activeChannelId === c.id
                        ? "bg-canvas font-semibold hairline text-coral"
                        : "text-body"
                    }`}
                  >
                    <Hash className="w-4 h-4 shrink-0 text-muted-ink" />
                    <span className="truncate">{c.name}</span>
                  </button>
                  <button
                    onClick={() => handleToggleJoin(c.id, c.isMember)}
                    className={`px-3 py-2 text-[11px] font-semibold cursor-pointer rounded-r-md transition-colors ${
                      c.isMember 
                        ? "text-muted-ink hover:text-red-500" 
                        : "text-coral hover:text-coral-active"
                    }`}
                  >
                    {c.isMember ? "Leave" : "Join"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Trending Tags (Desktop only) */}
          <div className="bg-surface-card rounded-lg p-5 hairline">
            <span className="caption-upper text-[11px] text-muted-ink font-semibold tracking-wider block mb-3 border-b border-hairline-soft pb-2">Trending Tags</span>
            <div className="space-y-1.5">
              {trendingTags.length === 0 ? (
                <p className="text-[12px] text-muted-soft italic px-3">No tags trending in last 48h</p>
              ) : (
                trendingTags.map((t) => (
                  <button
                    key={t.tag}
                    onClick={() => {
                      setActiveHashtag(t.tag);
                      setActiveChannelId(null);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-[13px] flex items-center justify-between transition-colors ${
                      activeHashtag === t.tag
                        ? "bg-canvas font-semibold hairline text-coral"
                        : "text-body hover:bg-canvas/50"
                    }`}
                  >
                    <span className="text-coral font-medium">#{t.tag}</span>
                    <span className="text-[11px] font-mono text-muted-soft">{t.postCount} posts</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Center - Feed Column */}
        <main className="col-span-1 md:col-span-9 space-y-6 max-w-xl md:max-w-none mx-auto w-full">
          
          {/* Top Search bar & Write trigger */}
          <div className="bg-surface-card rounded-lg p-4 hairline flex items-center gap-3 justify-between">
            <div className="relative flex-grow max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-soft" />
              <input
                type="text"
                placeholder="Search posts..."
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                className="w-full bg-canvas text-ink pl-9 pr-4 py-1.5 text-[13.5px] rounded-md hairline focus:outline-none focus:border-coral font-sans"
              />
            </div>
            
            <button
              onClick={() => {
                if (!loaderUser) {
                  setShowAuthPrompt(true);
                  return;
                }
                if (activeChannelId) {
                  setSelectedChannelId(activeChannelId);
                }
                setShowPostModal(true);
              }}
              className="bg-coral hover:bg-coral-active text-white text-[13px] px-4 py-2 font-medium rounded-md flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" /> Create Post
            </button>
          </div>

          {/* Feed Filter Headers */}
          <div className="bg-surface-card rounded-lg p-3 hairline flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setFeedMode("home");
                  setActiveChannelId(null);
                  setActiveHashtag(null);
                }}
                className={`px-3.5 py-1 rounded-md text-[13px] font-medium transition-colors ${
                  feedMode === "home" && activeChannelId === null && activeHashtag === null
                    ? "bg-canvas hairline text-ink"
                    : "text-muted-ink hover:text-ink"
                }`}
              >
                {loaderUser ? "Home Feed" : "Discover Feed"}
              </button>
              <button
                onClick={() => {
                  setFeedMode("discover");
                  setActiveChannelId(null);
                  setActiveHashtag(null);
                }}
                className={`px-3.5 py-1 rounded-md text-[13px] font-medium transition-colors ${
                  feedMode === "discover" && activeChannelId === null && activeHashtag === null
                    ? "bg-canvas hairline text-ink"
                    : "text-muted-ink hover:text-ink"
                }`}
              >
                Discover Communities
              </button>
            </div>

            {/* Sort selection */}
            <div className="flex items-center gap-1.5 bg-canvas/60 p-0.5 rounded-md hairline">
              {[
                { type: "new", icon: <Clock className="w-3.5 h-3.5" />, label: "New" },
                { type: "top", icon: <BarChart2 className="w-3.5 h-3.5" />, label: "Top" },
                { type: "hot", icon: <Flame className="w-3.5 h-3.5" />, label: "Hot" }
              ].map((s) => (
                <button
                  key={s.type}
                  onClick={() => setSortBy(s.type as any)}
                  className={`px-2.5 py-1 rounded text-[12px] font-medium flex items-center gap-1 transition-colors ${
                    sortBy === s.type
                      ? "bg-white text-coral font-semibold shadow-sm"
                      : "text-muted-ink hover:text-ink"
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Active Hashtag Header */}
          {activeHashtag && (
            <div className="bg-surface-card rounded-lg p-4 hairline flex items-center justify-between animate-fade-up">
              <div>
                <h3 className="font-display text-[22px] text-ink flex items-center gap-1">
                  <Hash className="w-5 h-5 text-coral" /> #{activeHashtag}
                </h3>
                <p className="text-[12.5px] text-muted-ink">Showing posts containing the tag #{activeHashtag}</p>
              </div>
              <button 
                onClick={() => setActiveHashtag(null)}
                className="text-[12px] font-medium text-coral hover:underline"
              >
                Clear filter
              </button>
            </div>
          )}

          {/* Active Channel Header */}
          {activeChannelId && (
            (() => {
              const current = channels.find(c => c.id === activeChannelId);
              if (!current) return null;
              return (
                <div className="bg-surface-card rounded-lg p-5 hairline animate-fade-up">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-display text-[24px] text-ink flex items-center gap-1">
                        <Hash className="w-5 h-5 text-coral" /> {current.name}
                      </h2>
                      {current.description && (
                        <p className="mt-1 text-[13.5px] text-muted-ink">{current.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleToggleJoin(current.id, current.isMember)}
                      className={`px-3.5 py-1.5 text-[12px] font-semibold border rounded-md cursor-pointer transition-colors ${
                        current.isMember 
                          ? "bg-canvas text-muted-ink border-hairline hover:bg-red-50 hover:text-red-600" 
                          : "bg-coral text-white border-coral hover:bg-coral-active"
                      }`}
                    >
                      {current.isMember ? "Joined" : "Join Channel"}
                    </button>
                  </div>
                  <div className="mt-3.5 text-[11.5px] font-mono text-muted-soft flex items-center gap-4">
                    <span>{current.memberCount} members</span>
                    <span>{current.postCount} posts</span>
                  </div>
                </div>
              );
            })()
          )}

          {/* Posts Feed list */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-surface-card rounded-lg p-6 hairline animate-pulse space-y-3">
                    <div className="h-4 bg-canvas/80 w-1/3 rounded" />
                    <div className="h-6 bg-canvas/80 w-3/4 rounded" />
                    <div className="h-12 bg-canvas/80 w-full rounded" />
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="bg-surface-card rounded-lg p-12 text-center hairline">
                <Compass className="w-10 h-10 text-muted-soft mx-auto mb-3" />
                <h3 className="font-display text-[20px] text-ink mb-1">No posts found</h3>
                <p className="text-[13.5px] text-muted-ink">
                  {feedMode === "home" 
                    ? "Posts from your joined channels will appear here. Discover and join communities to get started!"
                    : "No posts have been shared in this community yet. Be the first to share one!"}
                </p>
              </div>
            ) : (
              posts.map((post) => (
                <article key={post.id} className="bg-surface-card rounded-lg p-4 sm:p-6 hairline animate-fade-up flex gap-3 sm:gap-4">
                  {/* Vote Column */}
                  <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                    <button
                      onClick={() => handleVote(post.id, post.userVote, 1)}
                      className={`p-1 rounded hover:bg-canvas transition-colors cursor-pointer ${
                        post.userVote === 1 ? "text-coral" : "text-muted-soft"
                      }`}
                    >
                      <ChevronUp className="w-5.5 h-5.5 sm:w-6 sm:h-6" />
                    </button>
                    <span className={`text-[12.5px] sm:text-[13px] font-bold font-mono ${
                      post.userVote === 1 ? "text-coral" : post.userVote === -1 ? "text-blue-500" : "text-ink"
                    }`}>
                      {post.voteScore}
                    </span>
                    <button
                      onClick={() => handleVote(post.id, post.userVote, -1)}
                      className={`p-1 rounded hover:bg-canvas transition-colors cursor-pointer ${
                        post.userVote === -1 ? "text-blue-500" : "text-muted-soft"
                      }`}
                    >
                      <ChevronDown className="w-5.5 h-5.5 sm:w-6 sm:h-6" />
                    </button>
                  </div>

                  {/* Content Column */}
                  <div className="flex-grow min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] sm:text-[12px] text-muted-ink mb-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveChannelId(post.channelId);
                          setActiveHashtag(null);
                        }}
                        className="font-semibold text-coral hover:underline text-left cursor-pointer"
                      >
                        #{post.channelName}
                      </button>
                      <span>•</span>
                      <span>{post.username}</span>
                      <span className="inline-flex items-center px-1.5 py-0.2 rounded-pill bg-canvas text-[10px] sm:text-[11px] font-semibold border border-hairline-soft font-mono">
                        {post.companyDomain}
                      </span>
                      <span>•</span>
                      <span>{new Date(post.createdAt).toISOString().split("T")[0]}</span>
                    </div>

                    <Link to="/posts/$id" params={{ id: post.id }} className="block group">
                      <h3 className="font-display text-[18px] sm:text-[20px] text-ink group-hover:text-coral transition-colors leading-snug">
                        {post.title}
                      </h3>
                      <p className="mt-1.5 text-[13.5px] sm:text-[14px] leading-relaxed text-body line-clamp-3 font-sans">
                        {post.content}
                      </p>
                    </Link>

                    <div className="mt-4 pt-3 border-t border-hairline-soft/60 flex items-center text-[12.5px] text-muted-ink">
                      <Link to="/posts/$id" params={{ id: post.id }} className="flex items-center gap-1.5 hover:text-ink transition-colors">
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
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav className="sticky bottom-0 z-40 bg-canvas border-t border-hairline flex justify-around items-center h-14 md:hidden px-4">
        <button
          onClick={() => {
            clearAllFilters();
            setFeedMode("home");
          }}
          className={`flex flex-col items-center justify-center cursor-pointer ${
            activeChannelId === null && activeHashtag === null
              ? "text-coral font-semibold"
              : "text-muted-ink hover:text-ink"
          }`}
        >
          <Compass className="w-5.5 h-5.5" />
          <span className="text-[10px] mt-0.5">Explore</span>
        </button>
        
        <button
          onClick={() => setShowMobileDrawer(true)}
          className="flex flex-col items-center justify-center text-muted-ink hover:text-ink cursor-pointer"
        >
          <Menu className="w-5.5 h-5.5" />
          <span className="text-[10px] mt-0.5">Communities</span>
        </button>

        <button
          onClick={() => {
            if (!loaderUser) {
              setShowAuthPrompt(true);
              return;
            }
            setShowPostModal(true);
          }}
          className="flex flex-col items-center justify-center text-coral cursor-pointer"
        >
          <Plus className="w-6 h-6 p-1 bg-coral/10 rounded-full" />
          <span className="text-[10px] mt-0.5">Post</span>
        </button>

        {!loaderUser ? (
          <button
            onClick={() => {
              setExploreViewOnly(false);
              setShowAuthPrompt(false);
            }}
            className="flex flex-col items-center justify-center text-muted-ink hover:text-ink cursor-pointer"
          >
            <Lock className="w-5.5 h-5.5" />
            <span className="text-[10px] mt-0.5">Sign In</span>
          </button>
        ) : (
          <button
            onClick={handleLogout}
            className="flex flex-col items-center justify-center text-muted-ink hover:text-ink cursor-pointer"
          >
            <LogOut className="w-5.5 h-5.5" />
            <span className="text-[10px] mt-0.5">Log Out</span>
          </button>
        )}
      </nav>

      {/* MOBILE DRAWER SHEET */}
      {showMobileDrawer && (
        <div className="fixed inset-0 z-50 flex md:hidden animate-fade-in">
          <div 
            className="fixed inset-0 bg-black/45 backdrop-blur-sm" 
            onClick={() => setShowMobileDrawer(false)} 
          />
          <div className="relative w-72 max-w-[80vw] bg-surface-card hairline-r p-5 flex flex-col justify-between overflow-y-auto animate-fade-up">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-2 border-b border-hairline-soft">
                <span className="caption-upper text-[11px] text-muted-ink font-semibold tracking-wider">Communities</span>
                <button 
                  onClick={() => {
                    setShowMobileDrawer(false);
                    if (!loaderUser) {
                      setShowAuthPrompt(true);
                    } else {
                      setShowChannelModal(true);
                    }
                  }} 
                  className="text-coral cursor-pointer"
                >
                  <Plus className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* Drawer list */}
              <div className="space-y-1.5">
                <button
                  onClick={() => {
                    clearAllFilters();
                    setShowMobileDrawer(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-[13.5px] flex items-center gap-2 hover:bg-canvas/50"
                >
                  <Compass className="w-4 h-4" />
                  <span>Discover Feed</span>
                </button>

                {channels.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-md hover:bg-canvas/45">
                    <button
                      onClick={() => {
                        setActiveChannelId(c.id);
                        setActiveHashtag(null);
                        setShowMobileDrawer(false);
                      }}
                      className={`flex-grow text-left px-3 py-2 rounded-l-md text-[13.5px] flex items-center gap-2 truncate ${
                        activeChannelId === c.id ? "font-semibold text-coral" : "text-body"
                      }`}
                    >
                      <Hash className="w-4 h-4 shrink-0 text-muted-ink" />
                      <span className="truncate">{c.name}</span>
                    </button>
                    <button
                      onClick={() => {
                        handleToggleJoin(c.id, c.isMember);
                      }}
                      className="px-3 py-2 text-[11px] font-semibold text-coral cursor-pointer"
                    >
                      {c.isMember ? "Leave" : "Join"}
                    </button>
                  </div>
                ))}
              </div>

              {/* Drawer Trending hashtags */}
              <div className="pt-4 border-t border-hairline-soft/60">
                <span className="caption-upper text-[10px] text-muted-ink block mb-3">Trending Tags</span>
                <div className="space-y-1.5">
                  {trendingTags.map((t) => (
                    <button
                      key={t.tag}
                      onClick={() => {
                        setActiveHashtag(t.tag);
                        setActiveChannelId(null);
                        setShowMobileDrawer(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 rounded-md text-[13px] flex items-center justify-between ${
                        activeHashtag === t.tag ? "font-semibold text-coral bg-canvas" : "text-body hover:bg-canvas/50"
                      }`}
                    >
                      <span className="text-coral">#{t.tag}</span>
                      <span className="text-[11px] font-mono text-muted-soft">{t.postCount}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button 
              onClick={() => setShowMobileDrawer(false)}
              className="mt-6 flex items-center gap-1 text-[13px] font-medium text-muted-ink hover:text-ink hover:underline cursor-pointer"
            >
              <X className="w-4 h-4" /> Close Menu
            </button>
          </div>
        </div>
      )}

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
                    setExploreViewOnly(false);
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

      {/* MODAL: Create Channel */}
      {showChannelModal && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-surface-card max-w-[480px] w-full rounded-xl p-6 hairline shadow-2xl animate-fade-up font-sans">
            <h3 className="font-display text-display-sm text-ink mb-2">Create a new community</h3>
            <p className="text-[13.5px] text-body mb-4 leading-relaxed">
              Channels align employees around companies or topics. Creators remain completely anonymized.
            </p>
            
            <form onSubmit={handleCreateChannel} className="space-y-4">
              <div>
                <label className="caption-upper text-[11px] text-muted-ink block mb-1">Channel Name (slug)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. apple, auth-discussion"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                  disabled={isLoading}
                  className="w-full bg-canvas text-ink px-3 py-2 text-[14px] rounded-md hairline focus:outline-none focus:border-coral"
                />
              </div>
              <div>
                <label className="caption-upper text-[11px] text-muted-ink block mb-1">Description</label>
                <textarea
                  placeholder="What is this community for?"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  disabled={isLoading}
                  rows={3}
                  className="w-full bg-canvas text-ink px-3 py-2 text-[14px] rounded-md hairline focus:outline-none focus:border-coral resize-none"
                />
              </div>

              {errorMsg && (
                <p className="text-destructive text-[13px] font-medium">{errorMsg}</p>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChannelModal(false)}
                  className="px-4 py-2 text-[13px] font-medium hover:bg-canvas rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || newChannelName.length < 3}
                  className="bg-coral hover:bg-coral-active text-white px-5 py-2 text-[13px] font-medium rounded-md cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? "Creating..." : "Create Community"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create Post */}
      {showPostModal && (
        <div className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-surface-card max-w-[600px] w-full rounded-xl p-6 hairline shadow-2xl animate-fade-up font-sans">
            <h3 className="font-display text-display-sm text-ink mb-2">Create a new post</h3>
            <p className="text-[13.5px] text-body mb-4">
              Share salary details, work questions, or feedback anonymously.
            </p>
            
            <form onSubmit={handleCreatePost} className="space-y-4">
              <div>
                <label className="caption-upper text-[11px] text-muted-ink block mb-1">Select Channel</label>
                <select
                  required
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-canvas text-ink px-3 py-2 text-[14px] rounded-md hairline focus:outline-none focus:border-coral"
                >
                  <option value="">-- Choose a community --</option>
                  {channels.map(c => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="caption-upper text-[11px] text-muted-ink block mb-1">Post Title</label>
                <input
                  type="text"
                  required
                  placeholder="Summarize your question or topic..."
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-canvas text-ink px-3 py-2.5 text-[14px] rounded-md hairline focus:outline-none focus:border-coral"
                />
              </div>

              {/* Content text area with placeholder for hashtags */}
              <div>
                <label className="caption-upper text-[11px] text-muted-ink block mb-1">Content</label>
                <textarea
                  required
                  placeholder="Share details, numbers, or context here... (tip: use #tags to categorize your post)"
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  disabled={isLoading}
                  rows={6}
                  className="w-full bg-canvas text-ink px-3 py-2 text-[14px] rounded-md hairline focus:outline-none focus:border-coral"
                />
              </div>

              {errorMsg && (
                <p className="text-destructive text-[13px] font-medium">{errorMsg}</p>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="px-4 py-2 text-[13px] font-medium hover:bg-canvas rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || postTitle.length < 5 || postContent.length < 10 || !selectedChannelId}
                  className="bg-coral hover:bg-coral-active text-white px-5 py-2 text-[13px] font-medium rounded-md cursor-pointer disabled:opacity-50"
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

function LandingPage({ onExplore }: { onExplore: () => void }) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");
    
    try {
      const res = await requestOtp({ data: email });
      if (res.success) {
        navigate({
          to: "/verify",
          search: { id: res.verificationId },
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to submit. Please verify your email and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 bg-canvas/85 backdrop-blur-md border-b border-hairline-soft">
        <div className="max-w-[1200px] mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <SpikeMark className="w-5 h-5 text-coral" />
            <span className="font-display text-[22px] leading-none text-ink tracking-tight font-display">the tweeting platform</span>
          </Link>
          <div className="flex items-center gap-6">
            <a
              href="https://blind-hire-alpha.vercel.app/"
              target="_blank"
              rel="noreferrer"
              className="text-[14px] font-medium text-muted-ink hover:text-ink transition-colors flex items-center gap-1"
            >
              Get Hired <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      <main className="flex-grow">
        <section className="relative">
          <div className="max-w-[1200px] mx-auto px-6 lg:px-10 pt-4 lg:pt-6 pb-12">
            <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              
              <div className="lg:col-span-7 animate-fade-up">
                <div className="inline-flex items-center gap-2 mb-4">
                  <span className="inline-flex items-center rounded-pill bg-surface-card text-ink px-3 py-1 text-[13px] font-medium font-sans">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5 inline text-coral" /> Zero-Linkage Architecture
                  </span>
                </div>
                
                <h1 className="text-display-xl text-ink">
                  Know what your
                  <br />
                  <span className="italic text-coral font-display">coworkers</span> really think.
                </h1>
                
                <p className="mt-4 text-[16px] leading-[1.5] text-body max-w-[560px] font-sans">
                  An anonymous workplace community where professionals share salary data, review companies, and talk honestly. Verified by your work email, protected by cryptographic isolation.
                </p>

                <div className="mt-6 bg-surface-card rounded-lg p-5 sm:p-6 hairline max-w-[540px]">
                  <h3 className="font-display text-[19px] text-ink mb-1.5">Verify your workplace email</h3>
                  <p className="text-[13px] text-muted-ink mb-3.5 font-sans">
                    Enter your work email to receive a magic sign-in code. We never persist plaintext emails.
                  </p>
                  
                  <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 font-sans">
                    <input
                      type="email"
                      required
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      className="flex-grow bg-canvas text-ink px-4 py-2 text-[14px] rounded-md hairline focus:outline-none focus:border-coral transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="bg-coral hover:bg-coral-active text-white px-5 h-10 rounded-md text-[14px] font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {isLoading ? "Sending OTP..." : "Get Magic Code"}
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>

                  {/* EXPLORE COMMUNITY CTA */}
                  <div className="mt-3.5 pt-3.5 border-t border-hairline-soft/60 flex items-center justify-between text-[13.5px]">
                    <span className="text-muted-ink">Want to look around first?</span>
                    <button
                      type="button"
                      onClick={onExplore}
                      className="text-coral hover:text-coral-active font-semibold transition-colors cursor-pointer"
                    >
                      Explore Community &rarr;
                    </button>
                  </div>
                  
                  {errorMsg && (
                    <p className="text-destructive text-[13px] mt-2.5 font-medium font-sans">{errorMsg}</p>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted-ink font-sans">
                  <span className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-coral" /> No password required
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-coral" /> Encrypted immediately
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-coral" /> Zero corporate tracking
                  </span>
                </div>
              </div>

              <div className="lg:col-span-5 animate-fade-up [animation-delay:120ms]">
                <div className="relative">
                  <div className="absolute -top-10 -left-6 text-[140px] leading-none font-display text-coral/10 select-none pointer-events-none">
                    "
                  </div>
                  
                  <div className="relative bg-surface-dark text-on-dark rounded-xl p-6 shadow-[0_20px_50px_rgba(20,20,19,0.3)] font-sans">
                    <div className="flex items-center justify-between pb-4 border-b border-white/10">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-surface-dark-elevated flex items-center justify-center">
                          <EyeOff className="w-4 h-4 text-on-dark-soft" />
                        </div>
                        <div>
                          <div className="text-[14px] font-medium text-on-dark">anon-eng-482</div>
                          <div className="text-[11px] text-on-dark-soft font-mono">google.com · verified</div>
                        </div>
                      </div>
                      <span className="text-[12px] bg-coral/20 text-coral px-2.5 py-0.5 rounded-pill font-medium">Trending</span>
                    </div>

                    <div className="mt-4">
                      <h4 className="font-display text-[21px] text-on-dark leading-snug">
                        Is Google matching Netflix's new L6 base offers?
                      </h4>
                      <p className="mt-2.5 text-[13.5px] leading-relaxed text-on-dark-soft">
                        Hearing reports that Netflix is offering $420k base cash for L6 equivalent roles. Has anyone successfully used this to negotiate a Google L6 counter? Recruiter is dragging feet...
                      </p>
                    </div>

                    <div className="mt-5 pt-4 border-t border-white/5 flex items-center gap-4 text-[12.5px] text-on-dark-soft">
                      <span className="flex items-center gap-1 hover:text-coral transition-colors cursor-pointer">
                        <ThumbsUp className="w-4 h-4" /> 142
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-4 h-4" /> 38 comments
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-on-dark-soft/60">sha-3fa82</span>
                    </div>
                  </div>

                  <div className="absolute -bottom-5 -right-4 bg-canvas hairline rounded-lg px-4 py-3 shadow-md hidden md:block animate-float">
                    <div className="caption-upper text-[11px] text-muted-ink">Security Guarantee</div>
                    <div className="text-[13px] font-medium text-ink mt-1 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-coral" /> Hashed identities cannot be linked
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Section 1: The Problem */}
        <section className="border-t border-hairline-soft bg-canvas py-24 font-sans">
          <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
            <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
              <div className="lg:col-span-5 animate-fade-up">
                <span className="caption-upper text-coral block mb-3 font-semibold">The Problem</span>
                <h2 className="text-display-lg text-ink">
                  Fear of <span className="italic font-display text-coral">retaliation</span> keeps workplace truths silent.
                </h2>
                <p className="mt-6 text-[16px] leading-[1.6] text-body max-w-[480px]">
                  When employees cannot speak honestly, companies breed toxic cultures, pay disparities grow, and structural issues remain hidden. Current channels fail because they always expose the messenger.
                </p>
              </div>
              <div className="lg:col-span-7 flex flex-col gap-4 animate-fade-up [animation-delay:120ms]">
                <div className="bg-surface-card rounded-lg p-6 hairline">
                  <h3 className="text-[17px] font-semibold text-ink mb-1.5">Active Corporate Surveillance</h3>
                  <p className="text-[14px] leading-relaxed text-body">
                    Slack, Teams, and work emails are entirely owned and monitored by IT. Any critical feedback or salary transparency discussions on company networks carry a permanent digital trace.
                  </p>
                </div>
                <div className="bg-surface-card rounded-lg p-6 hairline">
                  <h3 className="text-[17px] font-semibold text-ink mb-1.5">Risks to Career & Reputation</h3>
                  <p className="text-[14px] leading-relaxed text-body">
                    Raising issues about management or policies publicly can lead to performance-plan blacklists, career stagnation, or immediate dismissal. Speaking up is a high-stakes personal gamble.
                  </p>
                </div>
                <div className="bg-surface-card rounded-lg p-6 hairline">
                  <h3 className="text-[17px] font-semibold text-ink mb-1.5">Performative Feedback Loops</h3>
                  <p className="text-[14px] leading-relaxed text-body">
                    Standard HR review forms are rarely truly anonymous. Metadata, writing style, or timing parameters are frequently used to trace reviews back to individual staff members.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: How It Works */}
        <section className="border-t border-hairline-soft bg-surface-soft/60 py-24 font-sans">
          <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
            <div className="mb-16 text-center animate-fade-up">
              <span className="caption-upper text-coral block mb-3 font-semibold">How It Works</span>
              <h2 className="text-display-lg text-ink">
                A secure protocol where identity has <span className="italic font-display text-coral font-display">nowhere</span> to hide.
              </h2>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  step: "01",
                  icon: <Mail className="w-5 h-5 text-coral" />,
                  title: "Verify Status",
                  desc: "Enter your official work email. We send a single-use magic code to verify that you are an active employee at your company."
                },
                {
                  step: "02",
                  icon: <ShieldCheck className="w-5 h-5 text-coral" />,
                  title: "Instant Encryption",
                  desc: "Your email is immediately encrypted with AES-256-GCM in memory and the OTP verified. Plaintext emails are never stored on disk."
                },
                {
                  step: "03",
                  icon: <Cpu className="w-5 h-5 text-coral" />,
                  title: "Salted Isolation",
                  desc: "We generate a unique Posting Hash using a secret salt. It is mathematically impossible to link this hash back to your email or BlindHire profile."
                },
                {
                  step: "04",
                  icon: <MessageSquare className="w-5 h-5 text-coral" />,
                  title: "Post Anonymously",
                  desc: "Choose an anonymous username. Post and comment in feeds where only your username and verified company domain are displayed."
                }
              ].map((s, idx) => (
                <div key={idx} className="bg-canvas rounded-lg p-6 hairline flex flex-col justify-between min-h-[250px] animate-fade-up" style={{ animationDelay: `${idx * 100}ms` }}>
                  <div>
                    <span className="font-display text-[32px] text-coral/20 leading-none">{s.step}</span>
                    <div className="w-9 h-9 bg-surface-soft rounded-md flex items-center justify-center my-4">
                      {s.icon}
                    </div>
                    <h3 className="text-[16px] font-semibold text-ink mb-2">{s.title}</h3>
                    <p className="text-[13px] leading-relaxed text-muted-ink">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: Privacy & Security */}
        <section className="border-t border-hairline-soft bg-canvas py-24 font-sans">
          <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
            <div className="bg-surface-dark text-on-dark rounded-xl p-8 lg:p-12 hairline relative overflow-hidden animate-fade-up">
              <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center relative z-10">
                <div className="lg:col-span-6">
                  <span className="caption-upper text-coral block mb-3 font-semibold">Privacy & Security</span>
                  <h2 className="text-display-md text-on-dark mb-4">
                    Cryptographic boundaries, <span className="italic font-display text-coral font-display">not</span> corporate policies.
                  </h2>
                  <p className="text-on-dark-soft text-[15px] leading-relaxed max-w-[480px]">
                    We believe anonymity is a technical requirement, not a visual filter. The tweeting platform is architected so that even with direct database access, no one can correlate your postings back to your real identity.
                  </p>
                </div>
                <div className="lg:col-span-6 grid sm:grid-cols-2 gap-4">
                  <div className="bg-surface-dark-elevated p-5 rounded-lg border border-white/5">
                    <h4 className="text-on-dark font-semibold text-[15px] mb-2">No Plaintext Storage</h4>
                    <p className="text-on-dark-soft text-[12.5px] leading-relaxed">
                      Emails are verified via OTP in memory and immediately deleted. We never store plaintext work emails anywhere.
                    </p>
                  </div>
                  <div className="bg-surface-dark-elevated p-5 rounded-lg border border-white/5">
                    <h4 className="text-on-dark font-semibold text-[15px] mb-2">Dual-Salt Isolation</h4>
                    <p className="text-on-dark-soft text-[12.5px] leading-relaxed">
                      Posting identities and hiring profiles use separate, independent salts. They cannot be merged or queried together.
                    </p>
                  </div>
                  <div className="bg-surface-dark-elevated p-5 rounded-lg border border-white/5">
                    <h4 className="text-on-dark font-semibold text-[15px] mb-2">Zero Metadata Logs</h4>
                    <p className="text-on-dark-soft text-[12.5px] leading-relaxed">
                      We strip client IP addresses, browser fingerprint headers, and query parameters to ensure zero tracking.
                    </p>
                  </div>
                  <div className="bg-surface-dark-elevated p-5 rounded-lg border border-white/5">
                    <h4 className="text-on-dark font-semibold text-[15px] mb-2">Domain-Only Feeds</h4>
                    <p className="text-on-dark-soft text-[12.5px] leading-relaxed">
                      Posts and comments display only your chosen handle and domain (e.g. google.com). Your identity remains sealed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-surface-dark py-12 border-t border-white/10 text-center text-on-dark-soft font-sans">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <SpikeMark className="w-4 h-4 text-on-dark" />
            <span className="font-display text-[16px] text-on-dark font-medium">the tweeting platform</span>
          </div>
          <p className="text-[12px] text-on-dark-soft">
            &copy; 2026. Standalone anonymous network. Protected by cryptographically isolated hashing.
          </p>
        </div>
      </footer>
    </div>
  );
}
