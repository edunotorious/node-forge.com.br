// Shapes of the public feedback wall (`GET /feedback`). Shared by the
// server page and the client island.

export const FEEDBACK_PAGE_SIZE = 20;
export const FEEDBACK_MIN_LENGTH = 3;
export const FEEDBACK_MAX_LENGTH = 2000;

export interface FeedbackAuthor {
  id: string;
  username: string | null;
  display_name: string | null;
}

export interface FeedbackItem {
  id: string;
  rating: number | null;
  message: string;
  created_at: string;
  anonymous: boolean;
  author: FeedbackAuthor | null;
  mine: boolean;
}

export interface FeedbackPage {
  items: FeedbackItem[];
  total: number;
  average_rating: number | null;
  rated_count: number;
}

export const EMPTY_FEEDBACK_PAGE: FeedbackPage = {
  items: [],
  total: 0,
  average_rating: null,
  rated_count: 0,
};

// `?from=` carries the page the user came from (stored for the team, never
// shown). It is user-controllable, so keep only a plain app path.
export function safeFromPath(from: string | undefined | null): string {
  if (!from || !from.startsWith("/") || from.startsWith("//")) return "";
  const path = from.split(/[?#\s\\]/)[0];
  return path.slice(0, 200);
}
