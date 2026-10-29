// What /api/admin/socialkit/* answers, shared by the backend and the admin page.
export type SocialPlatform = "xiaohongshu" | "wechat" | "weibo" | "x";

export interface KitItem {
  rank: number;
  storyPublicId: string;
  title: string;
  summary: string | null;
  /** The hot daily's one line on why it matters. */
  take?: string | null;
  participantCount: number;
  sourceNames: string[];
  url: string | null;
}

/** The hot daily's closing analysis, as the kit was written from it. */
export interface KitAnalysis {
  summary: string | null;
  market: string | null;
  stocks: Array<{ ticker: string; name: string; direction: string; reason: string }>;
}

/** The words on the images, and what the illustrations should show. */
export interface KitCards {
  cover: { headline: string; sub: string };
  items: Array<{ rank: number; tag: string; headline: string; points: string[] }>;
  /** Scene descriptions for the text-to-image model (no words in the picture). */
  art?: { cover: string; items: Array<{ rank: number; scene: string }> };
}

export interface KitCopy {
  xiaohongshu: { title: string; body: string; tags: string[] };
  wechat: { title: string; digest: string; body: string };
  weibo: { text: string };
  x: { thread: string[] };
}

export interface KitImage {
  platform: SocialPlatform;
  /** The file name under the kit: "xiaohongshu-cover-portrait.png". */
  file: string;
  label: string;
  width: number;
  height: number;
}

export type PostStatus = "publishing" | "published" | "drafted" | "failed" | "manual";

export interface KitPost {
  platform: SocialPlatform;
  status: PostStatus;
  url: string | null;
  error: string | null;
  updatedAt: string;
}

export interface SocialKit {
  date: string;
  items: KitItem[];
  analysis: KitAnalysis | null;
  cards: KitCards | null;
  copy: KitCopy | null;
  /** AI illustrations by slot ("cover", "1" … ), file names under the data folder. */
  art: Record<string, string> | null;
  error: string | null;
  images: KitImage[];
  posts: KitPost[];
  createdAt: string;
}

export interface SocialKitAdmin {
  kit: SocialKit | null;
  dates: string[];
  /** Which platforms can be published to automatically now (credentials set, SOCIAL_PUBLISH_ENABLED=true). */
  publishers: Record<SocialPlatform, { ready: boolean; note: string }>;
  /** The text-to-image model in use, or null when none is set. */
  imageModel: string | null;
}
