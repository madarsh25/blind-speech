import {
  ApiResponse,
  PostingIdentityUser,
  ChannelDto,
  PostDto,
  CommentNode,
  PostCommentsResponse,
  TrendingTagDto,
  ReportDto,
  RequestOtpRequest,
  RequestOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  CreateProfileRequest,
  CreateChannelRequest,
  CreatePostRequest,
  VoteRequest,
  CreateCommentRequest,
  CreateReportRequest,
  ModerateContentRequest,
} from "@blind-speech/shared";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // Send/receive HttpOnly cookies cross-origin
  });

  const data = await res.json().catch(() => ({
    success: false,
    error: `HTTP Error ${res.status}: ${res.statusText}`,
  }));

  if (!res.ok || data.success === false) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }

  return data;
}

export const api = {
  // Auth
  auth: {
    requestOtp: (req: RequestOtpRequest) =>
      request<RequestOtpResponse>("/auth/request-otp", {
        method: "POST",
        body: JSON.stringify(req),
      }),

    verifyOtp: (req: VerifyOtpRequest) =>
      request<VerifyOtpResponse>("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify(req),
      }),

    signup: (req: CreateProfileRequest) =>
      request<ApiResponse<void>>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(req),
      }),

    getMe: async (): Promise<PostingIdentityUser | null> => {
      const res = await request<{ success: boolean; user: PostingIdentityUser | null }>("/auth/me", {
        method: "GET",
      });
      return res.user;
    },

    logout: () =>
      request<ApiResponse<void>>("/auth/logout", {
        method: "POST",
      }),
  },

  // Channels
  channels: {
    list: async (): Promise<ChannelDto[]> => {
      const res = await request<{ success: boolean; data: ChannelDto[] }>("/channels", {
        method: "GET",
      });
      return res.data;
    },

    getBySlug: async (slug: string): Promise<ChannelDto> => {
      const res = await request<{ success: boolean; data: ChannelDto }>(`/channels/${slug}`, {
        method: "GET",
      });
      return res.data;
    },

    create: (req: CreateChannelRequest) =>
      request<{ success: boolean; data: { name: string; id: string } }>("/channels", {
        method: "POST",
        body: JSON.stringify(req),
      }),

    join: (channelId: string) =>
      request<ApiResponse<void>>(`/channels/${channelId}/join`, {
        method: "POST",
      }),

    leave: (channelId: string) =>
      request<ApiResponse<void>>(`/channels/${channelId}/leave`, {
        method: "POST",
      }),
  },

  // Posts
  posts: {
    list: async (params: {
      channelId?: string;
      sort?: "new" | "top" | "hot";
      searchQuery?: string;
    } = {}): Promise<PostDto[]> => {
      const query = new URLSearchParams();
      if (params.channelId) query.set("channelId", params.channelId);
      if (params.sort) query.set("sort", params.sort);
      if (params.searchQuery) query.set("searchQuery", params.searchQuery);

      const qs = query.toString();
      const res = await request<{ success: boolean; data: PostDto[] }>(`/posts${qs ? `?${qs}` : ""}`, {
        method: "GET",
      });
      return res.data;
    },

    getById: async (id: string): Promise<PostDto> => {
      const res = await request<{ success: boolean; data: PostDto }>(`/posts/${id}`, {
        method: "GET",
      });
      return res.data;
    },

    create: (req: CreatePostRequest) =>
      request<{ success: boolean; data: { id: string } }>("/posts", {
        method: "POST",
        body: JSON.stringify(req),
      }),

    vote: (postId: string, req: VoteRequest) =>
      request<ApiResponse<void>>(`/posts/${postId}/vote`, {
        method: "POST",
        body: JSON.stringify(req),
      }),

    getByHashtag: async (tag: string, sort: "new" | "top" | "hot" = "new"): Promise<PostDto[]> => {
      const res = await request<{ success: boolean; data: PostDto[] }>(
        `/posts/hashtag/${encodeURIComponent(tag)}?sort=${sort}`,
        { method: "GET" }
      );
      return res.data;
    },

    getTrendingHashtags: async (limit: number = 5): Promise<TrendingTagDto[]> => {
      const res = await request<{ success: boolean; data: TrendingTagDto[] }>(
        `/posts/trending/hashtags?limit=${limit}`,
        { method: "GET" }
      );
      return res.data;
    },
  },

  // Comments
  comments: {
    listByPost: async (postId: string, page: number = 1, pageSize: number = 50): Promise<PostCommentsResponse> => {
      const res = await request<{ success: boolean; data: PostCommentsResponse }>(
        `/posts/${postId}/comments?page=${page}&pageSize=${pageSize}`,
        { method: "GET" }
      );
      return res.data;
    },

    create: (postId: string, req: CreateCommentRequest) =>
      request<{ success: boolean; data: { id: string } }>(`/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify(req),
      }),

    vote: (commentId: string, req: VoteRequest) =>
      request<ApiResponse<void>>(`/comments/${commentId}/vote`, {
        method: "POST",
        body: JSON.stringify(req),
      }),
  },

  // Reports
  reports: {
    create: (req: CreateReportRequest) =>
      request<{ success: boolean; data: { id: string } }>("/reports", {
        method: "POST",
        body: JSON.stringify(req),
      }),

    listByChannel: async (channelId: string): Promise<ReportDto[]> => {
      const res = await request<{ success: boolean; data: ReportDto[] }>(`/reports/channel/${channelId}`, {
        method: "GET",
      });
      return res.data;
    },

    moderate: (reportId: string, req: ModerateContentRequest) =>
      request<ApiResponse<void>>(`/reports/${reportId}/moderate`, {
        method: "POST",
        body: JSON.stringify(req),
      }),
  },
};
