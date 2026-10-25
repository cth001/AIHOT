// What /api/discuss/* answers, shared by the backend and the web part.
export type Platform = "hn" | "reddit";

export interface DiscussComment {
  id: string;
  author: string | null;
  /** The Chinese translation when there is one, else the original. */
  text: string;
  original: string | null;
  score: number | null;
  replies: number;
  postedAt: string | null;
}

export interface DiscussThread {
  platform: Platform;
  url: string;
  title: string;
  community: string | null;
  points: number;
  commentCount: number;
  comments: DiscussComment[];
}

export interface StoryDiscussion {
  /** The model's summary of what people say. */
  summary: string | null;
  threads: DiscussThread[];
}
