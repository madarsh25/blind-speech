// User / Identity Types
export interface PostingIdentityUser {
  id: string;
  username: string;
  companyDomain: string;
}

export interface AuthSessionPayload {
  postingHash: string;
}

// Channel Types
export interface ChannelDto {
  id: string;
  name: string;
  description: string;
  postCount: number;
  memberCount: number;
  isMember: boolean;
}

// Post Types
export interface PostDto {
  id: string;
  title: string;
  content: string;
  username: string;
  companyDomain: string;
  channelName: string;
  channelId: string;
  createdAt: string;
  commentCount: number;
  voteScore: number;
  userVote: number;
  hotScore?: number;
}

// Comment Types
export interface CommentNode {
  id: string;
  content: string;
  username: string;
  companyDomain: string;
  parentId: string | null;
  createdAt: string;
  voteScore: number;
  userVote: number;
  depth: number;
  isDeleted: boolean;
  replies: CommentNode[];
}

export interface PostCommentsResponse {
  comments: CommentNode[];
  totalCount: number;
  totalPages: number;
}

// Hashtag Types
export interface TrendingTagDto {
  tag: string;
  postCount: number;
}

// Report Types
export interface ReportDto {
  id: string;
  postId: string | null;
  commentId: string | null;
  reason: string;
  status: string;
  createdAt: string;
  targetType: "post" | "comment";
  targetContent: string | undefined;
  reporterName: string;
}

// API Request/Response Shapes
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface RequestOtpRequest {
  email: string;
}

export interface RequestOtpResponse {
  success: boolean;
  verificationId: string;
}

export interface VerifyOtpRequest {
  id: string;
  code: string;
}

export interface VerifyOtpResponse {
  success: boolean;
  exists: boolean;
  token?: string;
}

export interface CreateProfileRequest {
  token: string;
  username: string;
}

export interface CreateChannelRequest {
  name: string;
  description: string;
}

export interface CreatePostRequest {
  channelId: string;
  title: string;
  content: string;
  tags?: string[];
}

export interface VoteRequest {
  value: number; // 1 | -1 | 0
}

export interface CreateCommentRequest {
  content: string;
  parentId?: string;
}

export interface CreateReportRequest {
  postId?: string;
  commentId?: string;
  reason: string;
}

export interface ModerateContentRequest {
  action: "dismiss" | "delete";
}
