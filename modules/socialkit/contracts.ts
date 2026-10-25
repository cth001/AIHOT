// What /api/admin/socialkit/* answers, shared by the backend and the admin page.
export type SocialPlatform = "xiaohongshu" | "wechat" | "weibo" | "x";

export interface KitItem {
  rank: number;
  storyPublicId: string;
  title: string;
  summary: string | null;
  participantCount: number;
  sourceNames: string[];
  url: string | null;
}

/** The words on the images. */
export interface KitCards {
  cover: { headline: string; sub: string };
  items: Array<{ rank: number; tag: string; headline: string; points: string[] }>;
}

export interface KitCopy {
  xiaohongshu: { title: string; body: string; tags: string[] };
  wechat: { title: string; digest: string; body: string };
  weibo: { text: string };
  x: { thread: string[] };
}

export interface KitImage {
  platform: SocialPlatform;
  /** The file name under the kit: "xiaohongshu-cover.png". */
  file: string;
  label: string;
  width: number;
  height: number;
}

export interface SocialKit {
  date: string;
  items: KitItem[];
  cards: KitCards | null;
  copy: KitCopy | null;
  error: string | null;
  images: KitImage[];
  createdAt: string;
}

export interface SocialKitAdmin {
  kit: SocialKit | null;
  dates: string[];
}
